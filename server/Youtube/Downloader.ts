import { spawn } from 'child_process'
import { promises as fsp } from 'fs'
import os from 'os'
import path from 'path'
import getLogger from '../lib/Log.js'
import Prefs from '../Prefs/Prefs.js'
import Library from '../Library/Library.js'
import Media from '../Media/Media.js'
import Queue from '../Queue/Queue.js'
import Rooms from '../Rooms/Rooms.js'
import MetaParser from '../Scanner/MetaParser/MetaParser.js'
import pushQueuesAndLibrary from '../lib/pushQueuesAndLibrary.js'
import type { YoutubeQualityPreset } from '../../shared/types.js'
import { buildFilenameBase, pickUniqueBase } from './filename.js'

const HEIGHT_CAP_BY_PRESET: Record<YoutubeQualityPreset, number | null> = {
  'best': null,
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
  '360p': 360,
}

interface YtFormat {
  format_id: string
  ext?: string
  vcodec?: string
  acodec?: string
  height?: number | null
  tbr?: number | null
  abr?: number | null
  filesize?: number | null
  filesize_approx?: number | null
}

interface ProbeResult {
  formats: YtFormat[]
  duration?: number
  stderr: string
}

type FailureKind = 'ejs' | 'bot' | null

const EJS_HINT = 'JS challenge solver (EJS) failed — ensure `deno` is installed on PATH and the host can reach github.com so yt-dlp can fetch remote components on first use.'
const BOT_HINT = 'YouTube served a bot-challenge — refresh cookies (re-export from a logged-in browser) and enable "Use cookies".'

function classifyFailure (stderr: string): FailureKind {
  if (/Signature solving failed|n challenge solving failed|Only images are available|challenge solver script.*skipped/i.test(stderr)) return 'ejs'
  if (/Sign in to confirm|HTTP Error 403|not a bot/i.test(stderr)) return 'bot'
  return null
}

function hintFor (kind: FailureKind): string | null {
  if (kind === 'ejs') return EJS_HINT
  if (kind === 'bot') return BOT_HINT
  return null
}

function isVideo (f: YtFormat): boolean {
  return !!f.vcodec && f.vcodec !== 'none'
}
function isAudio (f: YtFormat): boolean {
  return !!f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')
}
function isMp4Video (f: YtFormat): boolean {
  return f.ext === 'mp4' || (typeof f.vcodec === 'string' && f.vcodec.startsWith('avc1'))
}
function isMp4Audio (f: YtFormat): boolean {
  return f.ext === 'm4a' || (typeof f.acodec === 'string' && f.acodec.startsWith('mp4a'))
}

function pickBest<T> (arr: T[], score: (t: T) => number): T | null {
  let best: T | null = null
  let bestScore = -Infinity
  for (const item of arr) {
    const s = score(item)
    if (s > bestScore) {
      bestScore = s
      best = item
    }
  }
  return best
}

function videoScore (f: YtFormat): number {
  return (f.height ?? 0) * 1e6 + (f.tbr ?? 0)
}
function audioScore (f: YtFormat): number {
  return (f.abr ?? f.tbr ?? 0)
}

interface FormatSelection {
  videoId: string
  audioId: string | null
  needsRemux: boolean
}

export function selectFormats (formats: YtFormat[], heightCap: number | null): FormatSelection | null {
  const inCap = (f: YtFormat) => heightCap == null || (typeof f.height === 'number' && f.height <= heightCap)

  const videos = formats.filter(isVideo).filter(inCap)
  if (videos.length === 0) return null

  const mp4Videos = videos.filter(isMp4Video)
  const vid = mp4Videos.length > 0
    ? pickBest(mp4Videos, videoScore)!
    : pickBest(videos, videoScore)!

  const audios = formats.filter(isAudio)
  const mp4Audios = audios.filter(isMp4Audio)
  const aud = mp4Audios.length > 0
    ? pickBest(mp4Audios, audioScore)
    : pickBest(audios, audioScore)

  return {
    videoId: vid.format_id,
    audioId: aud ? aud.format_id : null,
    needsRemux: !isMp4Video(vid) || (aud != null && !isMp4Audio(aud)),
  }
}

function probeFormats (url: string, cookieFile: string | null): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const args = ['-J', '--ignore-config', '--no-playlist', '--no-warnings',
      '-f', 'all', '--no-check-formats',
      '--remote-components', 'ejs:github',
      '--extractor-args', 'youtube:player_client=tv,web_safari,default']
    if (cookieFile) args.unshift('--cookies', cookieFile)
    args.push(url)
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (b: Buffer) => {
      stdout += b.toString('utf8')
    })
    proc.stderr.on('data', (b: Buffer) => {
      stderr += b.toString('utf8')
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) {
        const tail = stderr.trim().split('\n').pop() || `yt-dlp probe exited ${code}`
        const hint = hintFor(classifyFailure(stderr))
        return reject(new Error(hint ? `${tail} — ${hint}` : tail))
      }
      try {
        const json = JSON.parse(stdout) as Omit<ProbeResult, 'stderr'>
        if (!Array.isArray(json.formats)) return reject(new Error('yt-dlp probe: no formats'))
        resolve({ ...json, stderr })
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
  })
}

const log = getLogger('Youtube')
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

export type JobStatus = 'queued' | 'downloading' | 'done' | 'error'

export interface Job {
  videoId: string
  status: JobStatus
  progress: number // 0..100
  error: string | null
  filename: string | null
  startedAt: number
  finishedAt: number | null
}

const jobs = new Map<string, Job>()

export class DownloaderError extends Error {
  status: number
  constructor (message: string, status: number) {
    super(message)
    this.name = 'DownloaderError'
    this.status = status
  }
}

export interface StartOptions {
  destDir: string
  pathId: number
  qualityPreset?: YoutubeQualityPreset
  useCookies?: boolean
  artist: string
  title: string
  roomId: number
  userId: number
  io?: any
}

export const Downloader = {
  getJob (videoId: string): Job | undefined {
    return jobs.get(videoId)
  },

  isActive (videoId: string): boolean {
    const j = jobs.get(videoId)
    return !!j && (j.status === 'queued' || j.status === 'downloading')
  },

  async start (videoId: string, opts: StartOptions): Promise<Job> {
    if (!VIDEO_ID_RE.test(videoId)) throw new DownloaderError('Invalid videoId', 422)
    if (Downloader.isActive(videoId)) {
      const existing = jobs.get(videoId)!
      return existing
    }

    try {
      const stat = await fsp.stat(opts.destDir)
      if (!stat.isDirectory()) throw new DownloaderError('Destination is not a directory', 500)
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException
      if (err.code === 'ENOENT') throw new DownloaderError('Destination directory does not exist', 500)
      throw e
    }

    const job: Job = {
      videoId,
      status: 'queued',
      progress: 0,
      error: null,
      filename: null,
      startedAt: Date.now(),
      finishedAt: null,
    }
    jobs.set(videoId, job)

    const url = `https://www.youtube.com/watch?v=${videoId}`
    const baseRaw = buildFilenameBase(opts.artist, opts.title)
    const baseUnique = await pickUniqueBase(opts.destDir, baseRaw)
    const outTemplate = `${baseUnique}.%(ext)s`
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), `kes-yt-${videoId}-`))

    const cookies = opts.useCookies ? Prefs.getYoutubeCookies() : null
    let cookieFile: string | null = null
    if (cookies) {
      cookieFile = path.join(os.tmpdir(), `kes-yt-${videoId}-${Date.now()}.txt`)
      await fsp.writeFile(cookieFile, cookies, { mode: 0o600 })
    }

    const heightCap = HEIGHT_CAP_BY_PRESET[opts.qualityPreset ?? 'best']
    let format: string
    let needsRemux = true
    let probeDuration: number | null = null
    try {
      const probe = await probeFormats(url, cookieFile)
      probeDuration = typeof probe.duration === 'number' ? Math.round(probe.duration) : null
      const sel = selectFormats(probe.formats, heightCap)
      if (!sel) {
        const anyVideo = probe.formats.some(isVideo)
        if (!anyVideo) {
          // Probe exited 0 but yt-dlp emitted no video formats — surface its warnings
          // (normally swallowed) so the operator can see WHY (EJS, bot-challenge, etc.).
          if (probe.stderr.trim()) {
            log.warn('yt-dlp probe (%s) stderr:\n%s', videoId, probe.stderr.trim())
          }
          const hint = hintFor(classifyFailure(probe.stderr))
            ?? 'no diagnostic markers in stderr — re-run yt-dlp manually with the same URL to inspect.'
          throw new Error(`yt-dlp probe returned no video streams: ${hint}`)
        }
        throw new Error(`No video formats at or below ${heightCap}p — try a lower quality preset or "best"`)
      }
      format = sel.audioId ? `${sel.videoId}+${sel.audioId}` : sel.videoId
      needsRemux = sel.needsRemux
      log.info('yt-dlp probe %s: picked %s (remux=%s, cap=%s)',
        videoId, format, needsRemux, heightCap ?? 'none')
    } catch (e) {
      cleanupCookies(cookieFile)
      cleanupTmpDir(tmpDir)
      job.status = 'error'
      let msg = e instanceof Error ? e.message : String(e)
      const hint = hintFor(classifyFailure(msg))
      if (hint) msg += ` — ${hint}`
      job.error = msg
      job.finishedAt = Date.now()
      log.warn('yt-dlp probe failed (%s): %s', videoId, job.error)
      return job
    }

    const args: string[] = [
      '--no-playlist',
      '--newline',
      '--no-part',
      '-f', format,
      '--merge-output-format', 'mp4',
      '--retries', '5',
      '--fragment-retries', '5',
      '--remote-components', 'ejs:github',
      '--extractor-args', 'youtube:player_client=tv,web_safari,default',
      '-P', `home:${opts.destDir}`,
      '-P', `temp:${tmpDir}`,
      '-o', outTemplate,
      '--print', 'after_move:filepath',
      url,
    ]
    if (needsRemux) args.splice(args.indexOf('-o'), 0, '--remux-video', 'mp4')
    if (cookieFile) args.unshift('--cookies', cookieFile)

    log.info('yt-dlp start: %s -> %s', videoId, opts.destDir)
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] })

    job.status = 'downloading'

    let stderrTail = ''
    let printedFile: string | null = null

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue
        const m = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line)
        if (m) {
          job.progress = Math.min(100, parseFloat(m[1]))
          continue
        }
        // last line printed by --print after_move:filepath is final filepath
        if (line.startsWith('/') || /^[A-Za-z]:[\\/]/.test(line)) {
          printedFile = line.trim()
        }
      }
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stderrTail = (stderrTail + text).slice(-2000)
    })

    proc.on('error', (err) => {
      job.status = 'error'
      job.error = err.message
      job.finishedAt = Date.now()
      log.error('yt-dlp spawn error: %s', err.message)
      cleanupCookies(cookieFile)
      cleanupTmpDir(tmpDir)
    })

    proc.on('close', async (code) => {
      cleanupCookies(cookieFile)
      cleanupTmpDir(tmpDir)
      if (code === 0) {
        job.progress = 100
        job.filename = printedFile
        try {
          await ingestDownloaded({
            absPath: printedFile,
            duration: probeDuration ?? 0,
            artist: opts.artist,
            title: opts.title,
            pathId: opts.pathId,
            destDir: opts.destDir,
            roomId: opts.roomId,
            userId: opts.userId,
            io: opts.io,
          })
          job.status = 'done'
          job.finishedAt = Date.now()
          log.info('yt-dlp done + ingested: %s -> %s', videoId, printedFile)
        } catch (e) {
          job.status = 'error'
          job.error = `Download finished but ingest failed: ${(e as Error).message}`
          job.finishedAt = Date.now()
          log.error('ingest failed (%s): %s', videoId, job.error)
        }
      } else {
        job.status = 'error'
        let msg = stderrTail.trim().split('\n').pop() || `yt-dlp exited with code ${code}`
        const hint = hintFor(classifyFailure(stderrTail))
        if (hint) msg += ` — ${hint}`
        job.error = msg
        job.finishedAt = Date.now()
        if (stderrTail.trim()) {
          log.warn('yt-dlp download (%s) stderr tail:\n%s', videoId, stderrTail.trim())
        }
        log.warn('yt-dlp failed (%s): %s', videoId, job.error)
      }
    })

    return job
  },
}

function cleanupCookies (file: string | null) {
  if (!file) return
  fsp.unlink(file).catch(() => { /* ignore */ })
}

function cleanupTmpDir (dir: string | null) {
  if (!dir) return
  fsp.rm(dir, { recursive: true, force: true }).catch(() => { /* ignore */ })
}

interface IngestArgs {
  absPath: string | null
  duration: number
  artist: string
  title: string
  pathId: number
  destDir: string
  roomId: number
  userId: number
  io?: any
}

async function ingestDownloaded (args: IngestArgs): Promise<void> {
  if (!args.absPath) throw new Error('yt-dlp did not report final filepath')

  try {
    await Rooms.validate(args.roomId, undefined, { validatePassword: false })
  } catch (e) {
    await fsp.unlink(args.absPath).catch(() => undefined)
    throw new Error(`Room no longer available (${(e as Error).message}); downloaded file removed`)
  }

  // normalize relPath: forward slashes, no leading slash (matches FileScanner convention)
  const relPath = path.relative(args.destDir, args.absPath).replace(/\\/g, '/').replace(/^\/+/, '')
  if (!relPath || relPath.startsWith('..')) {
    throw new Error(`downloaded file is outside dest dir: ${args.absPath}`)
  }

  const parser = MetaParser({})
  const parsed = parser({ name: `${args.artist} - ${args.title}`, file: args.absPath })

  const match = Library.matchSong({
    artist: parsed.artist,
    artistNorm: parsed.artistNorm,
    title: parsed.title,
    titleNorm: parsed.titleNorm,
  })

  if (!match.songId) throw new Error('Library.matchSong returned no songId')

  Media.add({
    songId: match.songId,
    pathId: args.pathId,
    relPath,
    duration: args.duration,
    dateAdded: Math.floor(Date.now() / 1000),
  })

  Queue.add({ roomId: args.roomId, songId: match.songId, userId: args.userId })

  log.info('ingested %s -> songId=%d, queued in roomId=%d', relPath, match.songId, args.roomId)

  if (args.io) {
    try {
      pushQueuesAndLibrary(args.io)
    } catch (e) {
      log.warn('library/queue broadcast failed: %s', (e as Error).message)
    }
  } else {
    Library.cache.version = null
  }
}

export default Downloader
