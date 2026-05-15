import { spawn } from 'child_process'
import { promises as fsp } from 'fs'
import os from 'os'
import path from 'path'
import getLogger from '../lib/Log.js'
import Prefs from '../Prefs/Prefs.js'
import type { YoutubeQualityPreset } from '../../shared/types.js'
import { buildFilenameBase, pickUniqueBase } from './filename.js'
import { ingestDownloaded } from './ingestDownloaded.js'

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
    log.debug('yt-dlp probe args: %s', args.join(' '))
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (b: Buffer) => {
      stdout += b.toString('utf8')
    })
    proc.stderr.on('data', (b: Buffer) => {
      const text = b.toString('utf8')
      stderr += text
      log.debug('yt-dlp probe stderr: %s', text.trimEnd())
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      log.debug('yt-dlp probe exited code=%d stdout=%d bytes stderr=%d bytes', code, stdout.length, stderr.length)
      if (code !== 0) {
        const tail = stderr.trim().split('\n').pop() || `yt-dlp probe exited ${code}`
        const hint = hintFor(classifyFailure(stderr))
        return reject(new Error(hint ? `${tail} — ${hint}` : tail))
      }
      try {
        const json = JSON.parse(stdout) as Omit<ProbeResult, 'stderr'>
        if (!Array.isArray(json.formats)) return reject(new Error('yt-dlp probe: no formats'))
        log.debug('yt-dlp probe parsed: %d formats, duration=%s', json.formats.length, json.duration ?? 'n/a')
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
  stage: string | null
  progress: number // 0..100
  error: string | null
  filename: string | null
  startedAt: number
  finishedAt: number | null
}

const jobs = new Map<string, Job>()

// ---------------------------------------------------------------------------
// Probe cache — stores yt-dlp format-probe results keyed by videoId + quality
// preset + cookie flag. Entries expire after PROBE_TTL_MS so stale format IDs
// are not reused across long sessions. Inflight dedup prevents duplicate probes
// when probe() and start() race for the same video.
// ---------------------------------------------------------------------------

interface ProbeEntry {
  format: string
  needsRemux: boolean
  probeDuration: number | null
  expiresAt: number
}

const PROBE_TTL_MS = 5 * 60 * 1000
const probeCache = new Map<string, ProbeEntry>()
const probeInflight = new Map<string, Promise<ProbeEntry>>()

function probeKey (videoId: string, qualityPreset: YoutubeQualityPreset | undefined, useCookies: boolean): string {
  return `${videoId}:${qualityPreset ?? 'best'}:${useCookies ? '1' : '0'}`
}

async function runProbe (videoId: string, qualityPreset: YoutubeQualityPreset | undefined, useCookies: boolean): Promise<ProbeEntry> {
  const url = `https://www.youtube.com/watch?v=${videoId}`
  const heightCap = HEIGHT_CAP_BY_PRESET[qualityPreset ?? 'best']
  const cookies = useCookies ? Prefs.getYoutubeCookies() : null
  let cookieFile: string | null = null
  if (cookies) {
    cookieFile = path.join(os.tmpdir(), `kes-yt-probe-${videoId}-${Date.now()}.txt`)
    await fsp.writeFile(cookieFile, cookies, { mode: 0o600 })
  }
  try {
    log.verbose('yt-dlp probing formats: %s', videoId)
    const probe = await probeFormats(url, cookieFile)
    const probeDuration = typeof probe.duration === 'number' ? Math.round(probe.duration) : null
    log.debug('yt-dlp probe: %d formats, duration=%s', probe.formats.length, probeDuration ?? 'n/a')
    const sel = selectFormats(probe.formats, heightCap)
    if (!sel) {
      const anyVideo = probe.formats.some(isVideo)
      if (!anyVideo) {
        if (probe.stderr.trim()) log.warn('yt-dlp probe (%s) stderr:\n%s', videoId, probe.stderr.trim())
        const hint = hintFor(classifyFailure(probe.stderr))
          ?? 'no diagnostic markers in stderr — re-run yt-dlp manually with the same URL to inspect.'
        throw new Error(`yt-dlp probe returned no video streams: ${hint}`)
      }
      throw new Error(`No video formats at or below ${heightCap}p — try a lower quality preset or "best"`)
    }
    const format = sel.audioId ? `${sel.videoId}+${sel.audioId}` : sel.videoId
    log.info('yt-dlp probe %s: picked %s (remux=%s, cap=%s)', videoId, format, sel.needsRemux, heightCap ?? 'none')
    log.debug('yt-dlp format selection: videoId=%s audioId=%s needsRemux=%s', sel.videoId, sel.audioId, sel.needsRemux)
    return { format, needsRemux: sel.needsRemux, probeDuration, expiresAt: Date.now() + PROBE_TTL_MS }
  } finally {
    cleanupCookies(cookieFile)
  }
}

// Returns a cached probe result or starts a new probe if none exists or the
// cached entry has expired. Concurrent callers for the same key share the
// single inflight promise so yt-dlp is only invoked once per unique video.
function ensureProbe (videoId: string, qualityPreset: YoutubeQualityPreset | undefined, useCookies: boolean): Promise<ProbeEntry> {
  const key = probeKey(videoId, qualityPreset, useCookies)
  const cached = probeCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    log.verbose('yt-dlp probe cache hit: %s', videoId)
    return Promise.resolve(cached)
  }
  const inflight = probeInflight.get(key)
  if (inflight) {
    log.verbose('yt-dlp probe inflight, awaiting: %s', videoId)
    return inflight
  }
  const promise = runProbe(videoId, qualityPreset, useCookies)
    .then((entry) => {
      probeCache.set(key, entry)
      probeInflight.delete(key)
      return entry
    })
    .catch((err) => {
      probeInflight.delete(key)
      throw err
    })
  probeInflight.set(key, promise)
  return promise
}

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

  // Public cache-warming entry point. Validates the videoId then delegates to
  // ensureProbe so the result is ready in the cache before start() is called.
  async probe (videoId: string, opts: { qualityPreset?: YoutubeQualityPreset, useCookies?: boolean } = {}): Promise<void> {
    if (!VIDEO_ID_RE.test(videoId)) throw new DownloaderError('Invalid videoId', 422)
    await ensureProbe(videoId, opts.qualityPreset, opts.useCookies ?? false)
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
      stage: null,
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

    log.verbose('yt-dlp job start: %s artist=%s title=%s quality=%s dest=%s', videoId, opts.artist, opts.title, opts.qualityPreset ?? 'best', opts.destDir)
    log.debug('yt-dlp tmpDir=%s outTemplate=%s', tmpDir, outTemplate)

    const cookies = opts.useCookies ? Prefs.getYoutubeCookies() : null
    let cookieFile: string | null = null
    if (cookies) {
      cookieFile = path.join(os.tmpdir(), `kes-yt-${videoId}-${Date.now()}.txt`)
      await fsp.writeFile(cookieFile, cookies, { mode: 0o600 })
      log.debug('yt-dlp cookie file written: %s', cookieFile)
    } else {
      log.debug('yt-dlp cookies: none')
    }

    // Resolve format selection via the probe cache. If the client called
    // probe() earlier the result is already warm and this returns immediately.
    let format: string
    let needsRemux: boolean
    let probeDuration: number | null
    try {
      const p = await ensureProbe(videoId, opts.qualityPreset, opts.useCookies ?? false)
      format = p.format
      needsRemux = p.needsRemux
      probeDuration = p.probeDuration
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
      url,
    ]
    if (needsRemux) args.splice(args.indexOf('-o'), 0, '--remux-video', 'mp4')
    if (cookieFile) args.unshift('--cookies', cookieFile)

    // Output path is predictable: merge-output-format mp4 always produces .mp4
    const outputFile = path.join(opts.destDir, `${baseUnique}.mp4`)

    // Weighted progress phases:
    //   0-20%  : probe / JS challenge (already done by here)
    //   20-90% : download (split between streams if 2-stream format)
    //   90-100%: merge / remux (no yt-dlp output; jump to 100 on close)
    const isTwoStream = format.includes('+')

    log.info('yt-dlp start: %s -> %s (twoStream=%s)', videoId, opts.destDir, isTwoStream)
    log.debug('yt-dlp download args: %s', args.join(' '))
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } })

    job.status = 'downloading'
    job.progress = 20

    let stderrTail = ''
    let streamIdx = 0

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      log.debug('yt-dlp stdout: %s', text.trimEnd())
      for (const line of text.split(/\r?\n/)) {
        const m = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line)
        if (!m) continue
        const pct = parseFloat(m[1])
        if (isTwoStream) {
          if (streamIdx === 0) {
            // video stream: 20-70%
            job.progress = Math.round(20 + pct * 0.5)
            if (pct >= 99.9) streamIdx = 1
          } else {
            // audio stream: 70-90%
            job.progress = Math.round(70 + pct * 0.2)
          }
        } else {
          // single stream: 20-90%
          job.progress = Math.round(20 + pct * 0.7)
        }
      }
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stderrTail = (stderrTail + text).slice(-2000)
      log.debug('yt-dlp stderr: %s', text.trimEnd())
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
      log.debug('yt-dlp download exited code=%d outputFile=%s', code, outputFile)
      cleanupCookies(cookieFile)
      cleanupTmpDir(tmpDir)
      if (code === 0) {
        job.progress = 90 // merge/remux phase; set 100 after ingest
        job.filename = outputFile
        log.verbose('yt-dlp download complete, ingesting: %s -> %s', videoId, outputFile)
        try {
          await ingestDownloaded({
            absPath: outputFile,
            duration: probeDuration ?? 0,
            artist: opts.artist,
            title: opts.title,
            pathId: opts.pathId,
            destDir: opts.destDir,
            roomId: opts.roomId,
            userId: opts.userId,
            mediaType: 'mp4',
            io: opts.io,
          })
          job.status = 'done'
          job.progress = 100
          job.finishedAt = Date.now()
          log.info('yt-dlp done + ingested: %s -> %s', videoId, outputFile)
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

export default Downloader
