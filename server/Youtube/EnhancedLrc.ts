import { promises as fsp } from 'fs'
import path from 'path'
import getLogger from '../lib/Log.js'

const log = getLogger('EnhancedLrc')

const LRC_LINE_RE = /^\[(\d{1,2}):(\d{2})\.(\d{2,3})\](.*)/

const BACKEND_RE_TAG: Record<'ctc' | 'whisperx', string> = {
  ctc: 'ctc-forced-aligner',
  whisperx: 'whisperx',
}

export interface LrcLine {
  time: number
  text: string
  words: string[]
}

export interface WordSegment {
  word: string
  start: number
  end: number
}

export function getAlignBackend (): 'ctc' | 'whisperx' | 'none' {
  if (process.env.WHISPERX_SERVICE_URL) return 'whisperx'
  if (process.env.CTC_SERVICE_URL) return 'ctc'
  return 'none'
}

async function callAlignService (
  backend: 'ctc' | 'whisperx',
  audioPath: string,
  textPath: string,
  language: string,
  outputDir: string,
): Promise<void> {
  const baseUrl = backend === 'whisperx'
    ? process.env.WHISPERX_SERVICE_URL!
    : process.env.CTC_SERVICE_URL!
  const res = await fetch(`${baseUrl}/align`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_path: audioPath, text_path: textPath, language, output_dir: outputDir }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${backend} service: ${res.status} ${text.slice(-2000)}`)
  }
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

function parseWordSegments (parsed: unknown): WordSegment[] {
  const arr = Array.isArray(parsed) ? parsed : (parsed as any)?.word_segments ?? []
  return (arr as any[])
    .map((w: any) => ({ word: String(w.word ?? w.label ?? ''), start: Number(w.start), end: Number(w.end) }))
    .filter((w: WordSegment) => w.word)
}

export async function alignPlainText (
  audioPath: string,
  plainText: string,
  tmpDir: string,
  meta: { artist: string, title: string },
): Promise<string> {
  const backend = getAlignBackend()
  if (backend === 'none') throw new Error('no alignment service configured (set CTC_SERVICE_URL or WHISPERX_SERVICE_URL)')

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

  await callAlignService(backend, audioPath, textFile, lang, outDir)

  const audioBase = path.basename(audioPath, path.extname(audioPath))
  const raw = await fsp.readFile(path.join(outDir, `${audioBase}.json`), 'utf8')
  const allWords = parseWordSegments(JSON.parse(raw))

  const wordGroups: WordSegment[][] = []
  let offset = 0
  for (const line of lines) {
    wordGroups.push(allWords.slice(offset, offset + line.words.length))
    offset += line.words.length
  }

  return serializeEnhancedLrc(lines, wordGroups, meta, backend)
}

export async function enhanceLrc (
  audioPath: string,
  lrcContent: string,
  tmpDir: string,
  meta: { artist: string, title: string },
): Promise<string> {
  const backend = getAlignBackend()
  if (backend === 'none') throw new Error('no alignment service configured (set CTC_SERVICE_URL or WHISPERX_SERVICE_URL)')

  const lines = parseLrcLines(lrcContent)
  if (lines.length === 0) throw new Error('no LRC lines to enhance')

  const lang = detectLanguage(lines.map(l => l.text).join(' '))
  log.verbose('enhanceLrc: %d lines, lang=%s backend=%s', lines.length, lang, backend)

  const textFile = path.join(tmpDir, 'lyrics.txt')
  const outDir = path.join(tmpDir, 'align-out')

  await fsp.writeFile(textFile, lines.map(l => l.text).join('\n'), 'utf8')
  await fsp.mkdir(outDir, { recursive: true })

  await callAlignService(backend, audioPath, textFile, lang, outDir)

  const audioBase = path.basename(audioPath, path.extname(audioPath))
  const raw = await fsp.readFile(path.join(outDir, `${audioBase}.json`), 'utf8')
  const allWords = parseWordSegments(JSON.parse(raw))

  const wordGroups: WordSegment[][] = []
  let offset = 0
  for (const line of lines) {
    wordGroups.push(allWords.slice(offset, offset + line.words.length))
    offset += line.words.length
  }

  return serializeEnhancedLrc(lines, wordGroups, meta, backend)
}
