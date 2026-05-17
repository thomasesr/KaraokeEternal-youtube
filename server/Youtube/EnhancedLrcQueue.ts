import { promises as fsp } from 'fs'
import os from 'os'
import path from 'path'
import { unzip } from 'unzipit'
import { spawn } from 'child_process'
import getLogger from '../lib/Log.js'
import Media from '../Media/Media.js'
import Prefs from '../Prefs/Prefs.js'
import { enhanceLrc, isEnhancedLrc } from './EnhancedLrc.js'
import type { IYoutubePrefs } from '../../shared/types.js'
import { LRC_ENHANCE_STATUS } from '../../shared/actionTypes.js'

const log = getLogger('EnhancedLrcQueue')

export interface EnhanceCandidate {
  mediaId: number
  zipPath: string
  artist: string
  title: string
}

let isRunning = false

function spawnAsync (cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
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

export async function runEnhancedLrcQueue (
  candidates: EnhanceCandidate[],
  io: any,
): Promise<void> {
  if (isRunning) {
    log.warn('EnhancedLrcQueue already running, skipping %d candidates', candidates.length)
    return
  }
  if (candidates.length === 0) return

  isRunning = true
  log.info('EnhancedLrcQueue: processing %d candidates', candidates.length)

  const emitStatus = (isEnhancing: boolean, pct: number, text: string) => {
    io.emit('action', {
      type: LRC_ENHANCE_STATUS,
      payload: { isEnhancing, pct, text },
    })
  }

  emitStatus(true, 0, `Enhancing lyrics (0 of ${candidates.length})`)

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const label = `${c.artist} - ${c.title}`
    emitStatus(true, (i / candidates.length) * 100, `Enhancing lyrics (${i + 1} of ${candidates.length}): ${label}`)

    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kes-lrce-'))
    try {
      // read zip
      const buf = await fsp.readFile(c.zipPath)
      const { entries } = await unzip(new Uint8Array(buf))

      const vocalsName = Object.keys(entries).find(f => !f.includes('/') && f === 'vocals.mp3')
      const lrcName = Object.keys(entries).find(f => !f.includes('/') && f.endsWith('.lrc'))
      const audioName = Object.keys(entries).find(f => !f.includes('/') && f.endsWith('.mp3') && f !== 'vocals.mp3' && f !== 'accompaniment.mp3')
        ?? Object.keys(entries).find(f => !f.includes('/') && f.endsWith('.mp3'))

      if (!lrcName) {
        log.debug('skip %s: no lrc in zip', path.basename(c.zipPath))
        continue
      }

      const lrcBuf = Buffer.from(await entries[lrcName].arrayBuffer())
      const lrcContent = lrcBuf.toString('utf8')

      if (isEnhancedLrc(lrcContent)) {
        log.debug('skip %s: already enhanced', path.basename(c.zipPath))
        continue
      }

      // prefer vocals.mp3, fall back to any audio file (less accurate)
      const sourceAudioName = vocalsName ?? audioName
      if (!sourceAudioName) {
        log.debug('skip %s: no audio in zip for alignment', path.basename(c.zipPath))
        continue
      }

      // extract audio to tmpDir
      const audioBuf = Buffer.from(await entries[sourceAudioName].arrayBuffer())
      const audioTmpPath = path.join(tmpDir, sourceAudioName)
      await fsp.writeFile(audioTmpPath, audioBuf)

      // enhance
      const ytPrefs = (Prefs.get() as any)?.youtube as Partial<IYoutubePrefs> | undefined
      const backend = (ytPrefs?.enhancedLrcBackend === 'whisperx' ? 'whisperx' : 'ctc') as 'ctc' | 'whisperx'
      log.verbose('enhancing lrc for %s (audio=%s backend=%s)', label, sourceAudioName, backend)
      const enhanced = await enhanceLrc(audioTmpPath, lrcContent, tmpDir, { artist: c.artist, title: c.title }, backend)

      // repack zip: extract all entries except lrc, add enhanced lrc
      const newLrcPath = path.join(tmpDir, lrcName)
      await fsp.writeFile(newLrcPath, enhanced, 'utf8')

      const otherFiles: string[] = []
      for (const [name, entry] of Object.entries(entries)) {
        if (name.includes('/') || name === lrcName) continue
        const entryBuf = Buffer.from(await entry.arrayBuffer())
        const entryPath = path.join(tmpDir, name)
        await fsp.writeFile(entryPath, entryBuf)
        otherFiles.push(entryPath)
      }

      const newZipTmp = path.join(tmpDir, 'repacked.zip')
      await spawnAsync('zip', ['-j', newZipTmp, ...otherFiles, newLrcPath])

      // replace original zip
      try {
        await fsp.rename(newZipTmp, c.zipPath)
      } catch (e: any) {
        if (e.code !== 'EXDEV') throw e
        await fsp.copyFile(newZipTmp, c.zipPath)
      }

      // notify DB
      await Media.update({ mediaId: c.mediaId, dateUpdated: Math.floor(Date.now() / 1000) })
      log.info('enhanced lrc: %s', label)
    } catch (e) {
      log.warn('EnhancedLrcQueue: failed for %s: %s', label, (e as Error).message)
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  isRunning = false
  emitStatus(false, 100, `Lyrics enhanced (${candidates.length} processed)`)
  log.info('EnhancedLrcQueue: done')
}
