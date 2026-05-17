import { spawn } from 'child_process'
import { promises as fsp } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import getLogger from '../lib/Log.js'

const _dir = path.dirname(fileURLToPath(import.meta.url))
const CTC_ALIGN_PY = path.join(_dir, 'ctc_align.py')
const WHISPERX_ALIGN_PY = path.join(_dir, 'whisperx_align.py')

const BACKEND_SCRIPT: Record<'ctc' | 'whisperx', string> = {
  ctc: CTC_ALIGN_PY,
  whisperx: WHISPERX_ALIGN_PY,
}
const BACKEND_RE_TAG: Record<'ctc' | 'whisperx', string> = {
  ctc: 'ctc-forced-aligner',
  whisperx: 'whisperx',
}

const log = getLogger('EnhancedLrc')

const LRC_LINE_RE = /^\[(\d{1,2}):(\d{2})\.(\d{2,3})\](.*)/

export interface LrcLine {
  time: number // seconds
  text: string
  words: string[]
}

export interface WordSegment {
  word: string
  start: number
  end: number
}

function spawnAsync (cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env ? { ...process.env, ...env } : undefined,
    })
    let stderr = ''
    proc.stderr.on('data', (b: Buffer) => { stderr = (stderr + b.toString()).slice(-4000) })
    proc.stdout.on('data', () => {})
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) return resolve()
      reject(new Error(stderr.trim().split('\n').pop() || `${cmd} exited ${code}`))
    })
  })
}

export function isEnhancedLrc (lrcContent: string): boolean {
  return lrcContent.includes('[re:ctc-forced-aligner]') || lrcContent.includes('[re:whisperx]')
}

export function parseLrcLines (lrcContent: string): LrcLine[] {
  const lines: LrcLine[] = []
  for (const raw of lrcContent.split(/\r?\n/)) {
    const m = LRC_LINE_RE.exec(raw)
    if (!m) continue
    const min = parseInt(m[1], 10)
    const sec = parseInt(m[2], 10)
    const cs = m[3].length === 3 ? parseInt(m[3], 10) / 10 : parseInt(m[3], 10)
    const time = min * 60 + sec + cs / 100
    const text = m[4].trim()
    if (!text) continue
    const words = text.split(/\s+/).filter(Boolean)
    lines.push({ time, text, words })
  }
  return lines
}

export function detectLanguage (text: string): string {
  const clean = text.replace(/\[.*?\]/g, '').trim()
  if (!clean) return 'eng'

  const total = clean.replace(/\s/g, '').length || 1
  const cjk = (clean.match(/[぀-鿿가-힯]/g) || []).length
  const cyrillic = (clean.match(/[Ѐ-ӿ]/g) || []).length
  const arabic = (clean.match(/[؀-ۿ]/g) || []).length
  const hebrew = (clean.match(/[֐-׿]/g) || []).length

  if (cjk / total > 0.3) {
    if (/[぀-ゟ゠-ヿ]/.test(clean)) return 'jpn'
    if (/[가-힯]/.test(clean)) return 'kor'
    return 'zho'
  }
  if (cyrillic / total > 0.3) return 'rus'
  if (arabic / total > 0.3) return 'ara'
  if (hebrew / total > 0.3) return 'heb'
  return 'eng'
}

function formatLrcTime (sec: number): string {
  const min = Math.floor(sec / 60)
  const s = sec % 60
  const secInt = Math.floor(s)
  const cs = Math.min(99, Math.round((s - secInt) * 100))
  return `${String(min).padStart(2, '0')}:${String(secInt).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export function serializeEnhancedLrc (
  lines: LrcLine[],
  wordGroups: WordSegment[][],
  meta: { artist: string, title: string },
  backend: 'ctc' | 'whisperx' = 'ctc',
): string {
  const header = [
    `[ar:${meta.artist}]`,
    `[ti:${meta.title}]`,
    '[by:KaraokeEternal]',
    `[re:${BACKEND_RE_TAG[backend]}]`,
    '[ve:1.0]',
    '',
  ].join('\n')

  const body = lines.map((line, i) => {
    const words = wordGroups[i]
    if (!words || words.length === 0) {
      return `[${formatLrcTime(line.time)}]${line.text}`
    }
    const lineTime = formatLrcTime(words[0].start)
    const wordTags = words.map(w => `<${formatLrcTime(w.start)}>${w.word}`).join(' ')
    return `[${lineTime}]${wordTags}`
  }).join('\n')

  return header + body + '\n'
}

export async function alignPlainText (
  audioPath: string,
  plainText: string,
  tmpDir: string,
  meta: { artist: string, title: string },
  backend: 'ctc' | 'whisperx' = 'ctc',
): Promise<string> {
  const rawLines = plainText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (rawLines.length === 0) throw new Error('no lyrics lines provided')

  const lines: LrcLine[] = rawLines.map(text => ({
    time: 0,
    text,
    words: text.split(/\s+/).filter(Boolean),
  }))

  const lang = detectLanguage(rawLines.join(' '))
  log.verbose('alignPlainText: %d lines, lang=%s backend=%s', lines.length, lang, backend)

  const textFile = path.join(tmpDir, 'lyrics.txt')
  const outDir = path.join(tmpDir, 'align-out')

  await fsp.writeFile(textFile, rawLines.join('\n'), 'utf8')
  await fsp.mkdir(outDir, { recursive: true })

  const gpuEnv = backend === 'whisperx' ? 'WHISPERX_USE_GPU' : 'CTC_USE_GPU'
  const device = process.env[gpuEnv] === '1' ? 'cuda' : 'cpu'

  log.verbose('alignPlainText: audio=%s lang=%s device=%s backend=%s', path.basename(audioPath), lang, device, backend)

  await spawnAsync('python3', [
    BACKEND_SCRIPT[backend],
    '--audio_path', audioPath,
    '--text_path', textFile,
    '--language', lang,
    '--output_dir', outDir,
    '--device', device,
  ])

  const audioBase = path.basename(audioPath, path.extname(audioPath))
  const jsonPath = path.join(outDir, `${audioBase}.json`)
  const raw = await fsp.readFile(jsonPath, 'utf8')
  const parsed = JSON.parse(raw)

  const allWords: WordSegment[] = (Array.isArray(parsed) ? parsed : parsed.word_segments ?? [])
    .map((w: any) => ({ word: String(w.word ?? w.label ?? ''), start: Number(w.start), end: Number(w.end) }))
    .filter((w: WordSegment) => w.word)

  const wordGroups: WordSegment[][] = []
  let offset = 0
  for (const line of lines) {
    const count = line.words.length
    wordGroups.push(allWords.slice(offset, offset + count))
    offset += count
  }

  return serializeEnhancedLrc(lines, wordGroups, meta, backend)
}

export async function enhanceLrc (
  audioPath: string,
  lrcContent: string,
  tmpDir: string,
  meta: { artist: string, title: string },
  backend: 'ctc' | 'whisperx' = 'ctc',
): Promise<string> {
  const lines = parseLrcLines(lrcContent)
  if (lines.length === 0) throw new Error('no LRC lines to enhance')

  const lang = detectLanguage(lines.map(l => l.text).join(' '))
  log.verbose('enhanceLrc: %d lines, lang=%s backend=%s', lines.length, lang, backend)

  const plainText = lines.map(l => l.text).join('\n')
  const textFile = path.join(tmpDir, 'lyrics.txt')
  const outDir = path.join(tmpDir, 'align-out')

  await fsp.writeFile(textFile, plainText, 'utf8')
  await fsp.mkdir(outDir, { recursive: true })

  const gpuEnv = backend === 'whisperx' ? 'WHISPERX_USE_GPU' : 'CTC_USE_GPU'
  const device = process.env[gpuEnv] === '1' ? 'cuda' : 'cpu'

  log.verbose('enhanceLrc: audio=%s lang=%s device=%s backend=%s', path.basename(audioPath), lang, device, backend)

  await spawnAsync('python3', [
    BACKEND_SCRIPT[backend],
    '--audio_path', audioPath,
    '--text_path', textFile,
    '--language', lang,
    '--output_dir', outDir,
    '--device', device,
  ])

  const audioBase = path.basename(audioPath, path.extname(audioPath))
  const jsonPath = path.join(outDir, `${audioBase}.json`)
  const raw = await fsp.readFile(jsonPath, 'utf8')
  const parsed = JSON.parse(raw)

  const allWords: WordSegment[] = (Array.isArray(parsed) ? parsed : parsed.word_segments ?? [])
    .map((w: any) => ({ word: String(w.word ?? w.label ?? ''), start: Number(w.start), end: Number(w.end) }))
    .filter((w: WordSegment) => w.word)

  const wordGroups: WordSegment[][] = []
  let offset = 0
  for (const line of lines) {
    const count = line.words.length
    wordGroups.push(allWords.slice(offset, offset + count))
    offset += count
  }

  return serializeEnhancedLrc(lines, wordGroups, meta, backend)
}
