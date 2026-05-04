import { spawn } from 'child_process'
import { promises as fsp } from 'fs'
import os from 'os'
import path from 'path'
import getLogger from '../lib/Log.js'
import Prefs from '../Prefs/Prefs.js'
import { buildFilenameBase, pickUniqueBase } from './filename.js'
import { ingestDownloaded } from './ingestDownloaded.js'
import type { Job } from './Downloader.js'
import { DownloaderError } from './Downloader.js'

const log = getLogger('Youtube')
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

const jobs = new Map<string, Job>()

export interface SpleeterStartOptions {
  destDir: string
  pathId: number
  useCookies?: boolean
  artist: string
  title: string
  duration: number
  roomId: number
  userId: number
  io?: any
}

function spawnAsync (
  cmd: string,
  args: string[],
  opts: { cwd?: string; label?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  const label = opts.label ?? cmd
  log.debug('%s args: %s', label, args.join(' '))
  const env = opts.env ? { ...process.env, ...opts.env } : undefined
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: opts.cwd, env })
    let stderr = ''
    proc.stderr.on('data', (b: Buffer) => {
      const text = b.toString('utf8')
      stderr = (stderr + text).slice(-4000)
      log.debug('%s stderr: %s', label, text.trimEnd())
    })
    proc.stdout.on('data', (b: Buffer) => {
      log.debug('%s stdout: %s', label, b.toString('utf8').trimEnd())
    })
    proc.on('error', reject)
    proc.on('close', (code, signal) => {
      if (code === 0) return resolve()
      const tail = stderr.trim().split('\n').pop() || ''
      const reason = tail || (signal ? `${cmd} killed by ${signal}` : `${cmd} exited ${code}`)
      reject(new Error(reason))
    })
  })
}

async function fetchLrc (artist: string, title: string, duration: number): Promise<string> {
  const params = new URLSearchParams({
    artist_name: artist,
    track_name: title,
    duration: String(Math.round(duration)),
  })
  const res = await fetch(`https://lrclib.net/api/get?${params}`)
  if (!res.ok) throw new Error(`lrclib returned ${res.status} for "${artist} - ${title}"`)
  const data = await res.json() as { syncedLyrics?: string | null }
  if (!data.syncedLyrics) throw new Error(`No synced lyrics on lrclib for "${artist} - ${title}"`)
  return data.syncedLyrics
}

function cleanupDir (dir: string | null) {
  if (!dir) return
  fsp.rm(dir, { recursive: true, force: true }).catch(() => { /* ignore */ })
}

function cleanupFile (file: string | null) {
  if (!file) return
  fsp.unlink(file).catch(() => { /* ignore */ })
}

export const SpleeterDownloader = {
  getJob (videoId: string): Job | undefined {
    return jobs.get(videoId)
  },

  isActive (videoId: string): boolean {
    const j = jobs.get(videoId)
    return !!j && (j.status === 'queued' || j.status === 'downloading')
  },

  async start (videoId: string, opts: SpleeterStartOptions): Promise<Job> {
    if (!VIDEO_ID_RE.test(videoId)) throw new DownloaderError('Invalid videoId', 422)
    if (SpleeterDownloader.isActive(videoId)) return jobs.get(videoId)!

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

    // run pipeline async, do not await
    runPipeline(videoId, job, opts).catch(() => { /* errors set on job */ })

    return job
  },
}

async function runPipeline (videoId: string, job: Job, opts: SpleeterStartOptions): Promise<void> {
  const url = `https://www.youtube.com/watch?v=${videoId}`
  const baseRaw = buildFilenameBase(opts.artist, opts.title)
  const base = await pickUniqueBase(opts.destDir, baseRaw)

  log.verbose('spleeter pipeline start: %s artist=%s title=%s dest=%s', videoId, opts.artist, opts.title, opts.destDir)

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), `kes-spl-${videoId}-`))
  const stemsDir = path.join(tmpDir, 'stems')
  log.debug('spleeter tmpDir=%s stemsDir=%s', tmpDir, stemsDir)

  const cookies = opts.useCookies ? Prefs.getYoutubeCookies() : null
  let cookieFile: string | null = null
  if (cookies) {
    cookieFile = path.join(os.tmpdir(), `kes-spl-${videoId}-${Date.now()}.txt`)
    await fsp.writeFile(cookieFile, cookies, { mode: 0o600 })
    log.debug('spleeter cookie file written: %s', cookieFile)
  } else {
    log.debug('spleeter cookies: none')
  }

  const dlMp3 = path.join(tmpDir, `${base}-dl.%(ext)s`)
  const lrcFile = path.join(tmpDir, `${base}.lrc`)
  const zipFile = path.join(tmpDir, `${base}.zip`)
  const destZip = path.join(opts.destDir, `${base}.zip`)
  log.debug('spleeter paths: dlMp3=%s lrcFile=%s zipFile=%s destZip=%s', dlMp3, lrcFile, zipFile, destZip)

  try {
    // --- download audio ---
    job.status = 'downloading'
    job.stage = 'downloading'
    log.verbose('spleeter stage=downloading: %s', videoId)

    const ytArgs = [
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--no-playlist',
      '--no-part',
      '--newline',
      '--remote-components', 'ejs:github',
      '--extractor-args', 'youtube:player_client=tv,web_safari,default',
      '-P', `home:${tmpDir}`,
      '-o', `${base}-dl.%(ext)s`,
      url,
    ]
    if (cookieFile) ytArgs.unshift('--cookies', cookieFile)
    log.debug('spleeter yt-dlp args: %s', ytArgs.join(' '))

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('yt-dlp', ytArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
      let stderr = ''
      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        log.debug('spleeter yt-dlp stdout: %s', text.trimEnd())
        for (const line of text.split(/\r?\n/)) {
          const m = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line)
          if (m) job.progress = Math.round(parseFloat(m[1]) * 0.4)
        }
      })
      proc.stderr.on('data', (b: Buffer) => {
        const text = b.toString('utf8')
        stderr = (stderr + text).slice(-2000)
        log.debug('spleeter yt-dlp stderr: %s', text.trimEnd())
      })
      proc.on('error', reject)
      proc.on('close', code => {
        log.debug('spleeter yt-dlp exited code=%d', code)
        if (code === 0) return resolve()
        const tail = stderr.trim().split('\n').pop() || `yt-dlp exited ${code}`
        reject(new Error(tail))
      })
    })

    const dlMp3Resolved = path.join(tmpDir, `${base}-dl.mp3`)
    log.debug('spleeter resolved audio file: %s', dlMp3Resolved)

    // --- spleeter separate ---
    job.stage = 'separating'
    job.progress = 40
    log.verbose('spleeter stage=separating: %s', videoId)

    const spleeterModel = process.env.SPLEETER_MODEL ?? '2stems'
    const spleeterData = process.env.SPLEETER_DATA ?? '/data/spleeter'
    const configPath = path.join(spleeterData, 'pretrained_models', spleeterModel, `${spleeterModel}.json`)
    const useGpu = process.env.SPLEETER_USE_GPU === '1'
    log.debug('spleeter model=%s configPath=%s useGpu=%s', spleeterModel, configPath, useGpu)
    await spawnAsync('spleeter', [
      'separate',
      '-p', configPath,
      '-c', 'mp3',
      '-o', stemsDir,
      dlMp3Resolved,
    ], {
      label: 'spleeter:separate',
      env: useGpu
        ? { TF_FORCE_GPU_ALLOW_GROWTH: '1' }
        : { CUDA_VISIBLE_DEVICES: '', TF_CPP_MIN_LOG_LEVEL: '2' },
    })

    job.progress = 85

    // spleeter outputs {stemsDir}/{inputBasenameWithoutExt}/accompaniment.mp3 with -c mp3
    const stemSubdir = path.join(stemsDir, `${base}-dl`)
    const accompanimentMp3 = path.join(stemSubdir, 'accompaniment.mp3')
    log.debug('spleeter accompaniment mp3: %s', accompanimentMp3)

    // --- fetch LRC ---
    job.stage = 'fetching-lrc'
    log.verbose('spleeter stage=fetching-lrc: %s "%s - %s" duration=%ds', videoId, opts.artist, opts.title, opts.duration)

    const lrcContent = await fetchLrc(opts.artist, opts.title, opts.duration)
    log.debug('spleeter lrc fetched: %d chars', lrcContent.length)
    await fsp.writeFile(lrcFile, lrcContent, 'utf8')

    job.progress = 90

    // --- zip mp3 + lrc ---
    job.stage = 'zipping'
    log.verbose('spleeter stage=zipping: %s -> %s', videoId, zipFile)

    await spawnAsync('zip', ['-j', zipFile, accompanimentMp3, lrcFile], { label: 'zip' })

    job.progress = 95
    log.debug('spleeter zip done, moving %s -> %s', zipFile, destZip)

    // --- move to destDir and ingest ---
    try {
      await fsp.rename(zipFile, destZip)
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
      log.debug('spleeter rename EXDEV, falling back to copy+unlink')
      await fsp.copyFile(zipFile, destZip)
      await fsp.unlink(zipFile)
    }
    log.debug('spleeter zip moved to destDir: %s', destZip)

    log.verbose('spleeter stage=ingesting: %s', videoId)
    await ingestDownloaded({
      absPath: destZip,
      duration: opts.duration,
      artist: opts.artist,
      title: opts.title,
      pathId: opts.pathId,
      destDir: opts.destDir,
      roomId: opts.roomId,
      userId: opts.userId,
      mediaType: 'lrc',
      io: opts.io,
    })

    job.status = 'done'
    job.stage = null
    job.progress = 100
    job.filename = destZip
    job.finishedAt = Date.now()
    log.info('spleeter done + ingested: %s -> %s', videoId, destZip)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    job.status = 'error'
    job.stage = null
    job.error = msg
    job.finishedAt = Date.now()
    log.warn('spleeter pipeline failed (%s): %s', videoId, msg)
    cleanupFile(destZip)
  } finally {
    cleanupFile(cookieFile)
    cleanupDir(tmpDir)
    log.debug('spleeter tmpDir cleanup: %s', tmpDir)
  }
}

export default SpleeterDownloader
