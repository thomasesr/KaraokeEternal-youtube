import { spawn } from 'child_process'
import { promises as fsp } from 'fs'
import os from 'os'
import path from 'path'
import getLogger from '../lib/Log.js'
import Prefs from '../Prefs/Prefs.js'
import { buildFilenameBase, pickUniqueBase } from './filename.js'
import { ingestDownloaded } from './ingestDownloaded.js'
import { processAudioOnly } from '../Scanner/FileScanner/AudioOnlyProcessor.js'
import { alignPlainText } from './EnhancedLrc.js'
import type { IYoutubePrefs } from '../../shared/types.js'
import type { Job } from './Downloader.js'
import { DownloaderError } from './Downloader.js'

const log = getLogger('Youtube')
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

const jobs = new Map<string, Job>()
const pendingLyrics = new Map<string, { resolve: (text: string) => void, reject: (err: Error) => void }>()

export interface AudioOnlyStartOptions {
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
  opts: { label?: string, env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  const label = opts.label ?? cmd
  log.debug('%s args: %s', label, args.join(' '))
  const env = opts.env ? { ...process.env, ...opts.env } : undefined
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env })
    let stderr = ''
    proc.stderr.on('data', (b: Buffer) => { stderr = (stderr + b.toString('utf8')).slice(-4000) })
    proc.stdout.on('data', () => {})
    proc.on('error', reject)
    proc.on('close', (code, signal) => {
      if (code === 0) return resolve()
      const tail = stderr.trim().split('\n').pop() || ''
      reject(new Error(tail || (signal ? `${cmd} killed by ${signal}` : `${cmd} exited ${code}`)))
    })
  })
}

export const AudioOnlyDownloader = {
  getJob (videoId: string): Job | undefined {
    return jobs.get(videoId)
  },

  isActive (videoId: string): boolean {
    const j = jobs.get(videoId)
    return !!j && (j.status === 'queued' || j.status === 'downloading' || j.status === 'awaiting-lyrics')
  },

  submitLyrics (videoId: string, lyricsText: string): void {
    const pending = pendingLyrics.get(videoId)
    if (!pending) throw new DownloaderError('No lyrics pending for this video', 404)
    pendingLyrics.delete(videoId)
    pending.resolve(lyricsText)
  },

  cancelLyrics (videoId: string): void {
    const pending = pendingLyrics.get(videoId)
    if (!pending) return
    pendingLyrics.delete(videoId)
    pending.reject(new Error('Lyrics entry cancelled'))
  },

  async start (videoId: string, opts: AudioOnlyStartOptions): Promise<Job> {
    if (!VIDEO_ID_RE.test(videoId)) throw new DownloaderError('Invalid videoId', 422)
    if (AudioOnlyDownloader.isActive(videoId)) return jobs.get(videoId)!

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

    runPipeline(videoId, job, opts).catch(() => {})

    return job
  },
}

async function runPipeline (videoId: string, job: Job, opts: AudioOnlyStartOptions): Promise<void> {
  const url = `https://www.youtube.com/watch?v=${videoId}`
  const baseRaw = buildFilenameBase(opts.artist, opts.title)
  const base = await pickUniqueBase(opts.destDir, baseRaw)

  log.verbose('audioonly pipeline start: %s artist=%s title=%s dest=%s', videoId, opts.artist, opts.title, opts.destDir)

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), `kes-ao-yt-${videoId}-`))

  const cookies = opts.useCookies ? Prefs.getYoutubeCookies() : null
  let cookieFile: string | null = null
  if (cookies) {
    cookieFile = path.join(os.tmpdir(), `kes-ao-yt-${videoId}-${Date.now()}.txt`)
    await fsp.writeFile(cookieFile, cookies, { mode: 0o600 })
  }

  const tmpMp3 = path.join(tmpDir, `${base}-dl.%(ext)s`)
  const tmpMp3Resolved = path.join(tmpDir, `${base}-dl.mp3`)
  const destMp3 = path.join(opts.destDir, `${base}.mp3`)

  try {
    // --- download audio ---
    job.status = 'downloading'
    job.stage = 'downloading'
    log.verbose('audioonly stage=downloading: %s', videoId)

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

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('yt-dlp', ytArgs, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } })
      let stderr = ''
      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        for (const line of text.split(/\r?\n/)) {
          const m = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line)
          if (m) job.progress = Math.round(parseFloat(m[1]) * 0.4)
        }
      })
      proc.stderr.on('data', (b: Buffer) => { stderr = (stderr + b.toString('utf8')).slice(-2000) })
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code === 0) return resolve()
        reject(new Error(stderr.trim().split('\n').pop() || `yt-dlp exited ${code}`))
      })
    })

    // --- write ID3 tags ---
    job.stage = 'tagging'
    job.progress = 42
    log.verbose('audioonly stage=tagging: %s', videoId)

    const taggedMp3 = path.join(tmpDir, `${base}.mp3`)
    await spawnAsync('ffmpeg', [
      '-i', tmpMp3Resolved,
      '-metadata', `artist=${opts.artist}`,
      '-metadata', `title=${opts.title}`,
      '-codec', 'copy',
      '-y', taggedMp3,
    ], { label: 'ffmpeg:id3' })

    // --- move tagged mp3 to destDir so processAudioOnly places zip there ---
    try {
      await fsp.rename(taggedMp3, destMp3)
    } catch (e: any) {
      if (e.code !== 'EXDEV') throw e
      await fsp.copyFile(taggedMp3, destMp3)
    }

    // --- processAudioOnly: spleeter + fetchLrc + zip ---
    job.stage = 'separating'
    job.progress = 45
    log.verbose('audioonly stage=separating (via processAudioOnly): %s', videoId)

    const { zipPath } = await processAudioOnly(
      destMp3,
      (stage, pct) => {
        if (stage === 'awaiting-lyrics') {
          job.status = 'awaiting-lyrics'
        } else if (job.status === 'awaiting-lyrics') {
          job.status = 'downloading'
        }
        job.stage = stage
        job.progress = Math.round(45 + pct * 0.5)
      },
      async (vocalsMp3) => {
        job.status = 'awaiting-lyrics'
        job.stage = 'awaiting-lyrics'
        log.verbose('audioonly awaiting lyrics from user: %s', videoId)

        const plainText = await new Promise<string>((resolve, reject) => {
          pendingLyrics.set(videoId, { resolve, reject })
        })

        job.status = 'downloading'
        job.stage = 'enhancing-lrc'
        const ytPrefs = (Prefs.get() as any)?.youtube as Partial<IYoutubePrefs> | undefined
        const lrcBackend = (ytPrefs?.enhancedLrcBackend === 'whisperx' ? 'whisperx' : 'ctc') as 'ctc' | 'whisperx'
        log.verbose('audioonly aligning user-provided lyrics: %s backend=%s', videoId, lrcBackend)

        const alignTmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kes-align-'))
        try {
          return await alignPlainText(vocalsMp3, plainText, alignTmpDir, { artist: opts.artist, title: opts.title }, lrcBackend)
        } finally {
          fsp.rm(alignTmpDir, { recursive: true, force: true }).catch(() => {})
        }
      },
    )

    job.progress = 95

    // --- ingest ---
    log.verbose('audioonly stage=ingesting: %s', videoId)
    await ingestDownloaded({
      absPath: zipPath,
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
    job.filename = zipPath
    job.finishedAt = Date.now()
    log.info('audioonly done + ingested: %s -> %s', videoId, zipPath)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    job.status = 'error'
    job.stage = null
    job.error = msg
    job.finishedAt = Date.now()
    log.warn('audioonly pipeline failed (%s): %s', videoId, msg)
    fsp.unlink(destMp3).catch(() => {})
  } finally {
    if (cookieFile) fsp.unlink(cookieFile).catch(() => {})
    fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

export default AudioOnlyDownloader
