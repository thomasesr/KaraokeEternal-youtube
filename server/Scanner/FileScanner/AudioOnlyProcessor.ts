import { spawn } from 'child_process'
import { promises as fsp } from 'fs'
import os from 'os'
import path from 'path'
import { parseBuffer } from 'music-metadata'
import getLogger from '../../lib/Log.js'
import { buildFilenameBase, pickUniqueBase } from '../../Youtube/filename.js'

const log = getLogger('AudioOnly')

function spawnCmd (cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
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

async function fetchLrc (artist: string, title: string, duration: number): Promise<string> {
  const params = new URLSearchParams({
    artist_name: artist,
    track_name: title,
    duration: String(Math.round(duration)),
  })
  const res = await fetch(`https://lrclib.net/api/get?${params}`)
  if (!res.ok) throw new Error(`lrclib ${res.status} for "${artist} - ${title}"`)
  const data = await res.json() as { syncedLyrics?: string | null }
  if (!data.syncedLyrics) throw new Error(`no synced lyrics on lrclib for "${artist} - ${title}"`)
  return data.syncedLyrics
}

async function queryMusicBrainz (query: string): Promise<{ artist: string, title: string } | null> {
  const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&limit=1&fmt=json`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'KaraokeEternal/1.0 (karaoke-eternal@example.com)' } })
    if (!res.ok) return null
    const data = await res.json() as any
    const rec = data.recordings?.[0]
    const artist: string = rec?.['artist-credit']?.[0]?.artist?.name ?? ''
    const title: string = rec?.title ?? ''
    return artist && title ? { artist, title } : null
  } catch {
    return null
  }
}

// Parse "Artist - Title" from filename; rejects pure-number first parts (track numbers)
function parseFilename (basename: string): { artist: string, title: string } | null {
  const parts = basename.split(' - ')
  if (parts.length < 2) return null
  const artist = parts[0].trim()
  const title = parts.slice(1).join(' - ').trim()
  if (/^\d+$/.test(artist) || !artist || !title) return null
  return { artist, title }
}

async function runSpleeter (mp3Path: string, stemsDir: string): Promise<{ accompaniment: string, vocals: string }> {
  const spleeterModel = process.env.SPLEETER_MODEL ?? '2stems'
  const spleeterData = process.env.SPLEETER_DATA ?? '/data/spleeter'
  const useGpu = process.env.SPLEETER_USE_GPU === '1'

  let effectiveModel = spleeterModel
  let configPath = path.join(spleeterData, 'pretrained_models', spleeterModel, `${spleeterModel}.json`)

  try {
    await fsp.stat(configPath)
  } catch {
    if (spleeterModel !== '2stems') {
      log.warn('spleeter model config not found for %s — falling back to 2stems', spleeterModel)
      effectiveModel = '2stems'
      configPath = path.join(spleeterData, 'pretrained_models', '2stems', '2stems.json')
    } else {
      throw new Error(`spleeter model config not found: ${configPath}`)
    }
  }

  log.verbose('running spleeter on %s (model=%s)', path.basename(mp3Path), effectiveModel)
  await spawnCmd('spleeter', [
    'separate',
    '-p', configPath,
    '-c', 'mp3',
    '-o', stemsDir,
    mp3Path,
  ], useGpu
    ? { TF_FORCE_GPU_ALLOW_GROWTH: '1' }
    : { CUDA_VISIBLE_DEVICES: '', TF_CPP_MIN_LOG_LEVEL: '2' },
  )

  const stemSubdir = path.join(stemsDir, path.basename(mp3Path, '.mp3'))
  const accompaniment = path.join(stemSubdir, 'accompaniment.mp3')
  const vocals = path.join(stemSubdir, 'vocals.mp3')

  try {
    await fsp.stat(accompaniment)
  } catch {
    const topDirs = await fsp.readdir(stemsDir).catch(() => ['(stemsDir unreadable)'])
    const subEntries = topDirs.length
      ? await fsp.readdir(path.join(stemsDir, topDirs[0])).catch(() => ['(unreadable)'])
      : []
    throw new Error(
      `spleeter did not produce accompaniment.mp3 — stemsDir: ${JSON.stringify(topDirs)}, subdir: ${JSON.stringify(subEntries)}`,
    )
  }

  return { accompaniment, vocals }
}

export type AudioOnlyProgressCallback = (stage: string, pct: number) => void
export type LyricsNeededCallback = (vocalsMp3: string) => Promise<string>

export async function processAudioOnly (
  file: string,
  onProgress?: AudioOnlyProgressCallback,
  onLyricsNeeded?: LyricsNeededCallback,
): Promise<{ zipPath: string }> {
  const ext = path.extname(file).toLowerCase()
  const dir = path.dirname(file)
  const basename = path.basename(file, ext)
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kes-ao-'))

  try {
    // Step 1: ensure mp3
    let mp3Path: string
    if (ext === '.mp3') {
      mp3Path = file
    } else {
      const tempMp3 = path.join(tmpDir, 'audio.mp3')
      log.verbose('converting %s to mp3 320kbps', path.basename(file))
      onProgress?.('converting', 5)
      await spawnCmd('ffmpeg', ['-i', file, '-b:a', '320k', '-y', tempMp3])
      mp3Path = tempMp3
    }

    // Step 2: parse tags (from original, before spleeter strips them)
    const buf = await fsp.readFile(mp3Path)
    const meta = await parseBuffer(buf, 'audio/mpeg', { duration: true, skipCovers: true })
    let artist = (meta.common.artist ?? '').trim()
    let title = (meta.common.title ?? '').trim()
    const duration = meta.format.duration ?? 0

    if (!duration) throw new Error(`could not determine duration for ${path.basename(file)}`)

    if (!artist || !title) {
      const fromFilename = parseFilename(basename)
      if (fromFilename) ({ artist, title } = fromFilename)
    }

    if (!artist || !title) {
      log.verbose('querying MusicBrainz for "%s"', basename)
      const mb = await queryMusicBrainz(basename)
      if (mb) ({ artist, title } = mb)
    }

    if (!artist || !title) throw new Error(`no artist/title found for ${path.basename(file)}`)

    // Step 3: spleeter — extract instrumental accompaniment + vocals
    onProgress?.('separating', 10)
    const stemsDir = path.join(tmpDir, 'stems')
    const { accompaniment: accompanimentMp3, vocals: vocalsMp3 } = await runSpleeter(mp3Path, stemsDir)
    onProgress?.('separating', 80)

    // Step 4: fetch LRC (or request lyrics from caller if not found)
    onProgress?.('fetching-lrc', 85)
    let lrcContent: string
    try {
      log.verbose('fetching LRC: "%s - %s" duration=%ds', artist, title, Math.round(duration))
      lrcContent = await fetchLrc(artist, title, duration)
    } catch (lrcErr) {
      if (!onLyricsNeeded) throw lrcErr
      log.verbose('LRC fetch failed, requesting lyrics from caller: %s', (lrcErr as Error).message)
      onProgress?.('awaiting-lyrics', 85)
      lrcContent = await onLyricsNeeded(vocalsMp3)
    }

    // Step 5: zip accompaniment + vocals + lrc → dest
    onProgress?.('zipping', 90)
    const baseRaw = buildFilenameBase(artist, title)
    const base = await pickUniqueBase(dir, baseRaw)
    const lrcFile = path.join(tmpDir, `${base}.lrc`)
    const zipTmp = path.join(tmpDir, `${base}.zip`)
    const destZip = path.join(dir, `${base}.zip`)

    await fsp.writeFile(lrcFile, lrcContent, 'utf8')
    await spawnCmd('zip', ['-j', zipTmp, accompanimentMp3, vocalsMp3, lrcFile])

    try {
      await fsp.rename(zipTmp, destZip)
    } catch (e: any) {
      if (e.code !== 'EXDEV') throw e
      await fsp.copyFile(zipTmp, destZip)
    }

    await fsp.unlink(file).catch(() => {})
    log.info('audio-only: %s -> %s', path.basename(file), path.basename(destZip))
    return { zipPath: destZip }
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
