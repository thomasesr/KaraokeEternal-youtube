import path from 'path'
import fsPromises from 'node:fs/promises'
import { parseBuffer } from 'music-metadata'
import { unzip } from 'unzipit'
import getLogger from '../../lib/Log.js'
import { getExt } from '../../lib/util.js'
import getFiles from './getFiles.js'
import getConfig from './getConfig.js'
import getCdgName from '../../lib/getCdgName.js'
import getSidecarName from '../../lib/getSidecarName.js'
import Media from '../../Media/Media.js'
import MetaParser from '../MetaParser/MetaParser.js'
import Scanner from '../Scanner.js'
import IPC from '../../lib/IPCBridge.js'
import Prefs from '../../Prefs/Prefs.js'
import fileTypes from '../../Media/fileTypes.js'
import { processAudioOnly } from './AudioOnlyProcessor.js'
import { isEnhancedLrc } from '../../Youtube/EnhancedLrc.js'
import type { EnhanceCandidate } from '../../Youtube/EnhancedLrcQueue.js'
import { LIBRARY_MATCH_SONG, MEDIA_ADD, MEDIA_REMOVE, MEDIA_UPDATE } from '../../../shared/actionTypes.js'
const log = getLogger('FileScanner')

const audioExts = Object.keys(fileTypes).filter(ext => fileTypes[ext].mimeType.startsWith('audio/'))
const searchExts = Object.keys(fileTypes).filter(ext => fileTypes[ext].scan !== false)

class FileScanner extends Scanner {
  paths: any
  parser: any

  constructor (prefs, qStats) {
    super(qStats)
    this.paths = prefs.paths
  }

  async scan (pathId): Promise<{ stats: { new: number, removed: number, existing: number }, candidates: EnhanceCandidate[] }> {
    const dir = this.paths.entities[pathId]?.path
    const validMediaIds = []
    const stats = { new: 0, removed: 0, existing: 0 }
    const candidates: EnhanceCandidate[] = []
    const lrcEnhanceEnabled = !!(process.env.CTC_SERVICE_URL || process.env.WHISPERX_SERVICE_URL)
    let files // { file, stats }[]
    let prevDir

    if (!dir) {
      log.error('invalid pathId: %s', pathId)
      return { stats, candidates: [] }
    }

    log.info('Searching: %s', dir)
    this.emitStatus(`Searching: ${dir}`, 0)

    try {
      files = getFiles(dir, file => searchExts.includes(getExt(file)))

      log.info('  => found %s files with valid extensions %s',
        files.length.toLocaleString(),
        JSON.stringify(searchExts),
      )
    } catch (err) {
      log.error(`  => ${err.message} (path offline)`)
      return { stats, candidates: [] }
    }

    for (let i = 0; i < files.length; i++) {
      const curDir = path.dirname(files[i].file)

      if (prevDir !== curDir) {
        prevDir = curDir

        // (re)init parser with this folder's config, if any
        const cfg = getConfig(curDir, dir)
        this.parser = MetaParser(cfg)
      }

      log.info('[%s/%s] %s', i + 1, files.length, files[i].file)
      this.emitStatus(`Scanning (${i + 1} of ${files.length})`, (i + 1) / files.length)

      // process file
      try {
        const res = await this.process(files[i], pathId)
        validMediaIds.push(res.mediaId)

        if (res.isNew) stats.new++
        else stats.existing++

        if (lrcEnhanceEnabled && getExt(files[i].file) === '.zip') {
          const cand = await this.checkEnhanceCandidate(files[i].file, res.mediaId)
          if (cand) candidates.push(cand)
        }
      } catch (err) {
        log.warn(`  => ${err.message}`)
      }

      if (this.isCanceling) {
        this.emitStatus('Stopped', 100, false)
        return { stats, candidates }
      }
    } // end for

    log.info('Scanned %s valid media files', validMediaIds.length.toLocaleString())
    log.info('Searching for invalid media entries')

    const numRemoved = await this.removeInvalid(pathId, validMediaIds)
    stats.removed = numRemoved
    log.info(`Removed ${numRemoved} invalid media entries`)

    return { stats, candidates }
  }

  async checkEnhanceCandidate (file: string, mediaId: number): Promise<EnhanceCandidate | null> {
    try {
      const buf = await fsPromises.readFile(file)
      const { entries } = await unzip(new Uint8Array(buf))
      const lrcName = Object.keys(entries).find(f => !f.includes('/') && getExt(f) === '.lrc')
      const hasVocals = Object.keys(entries).includes('vocals.mp3')
      if (!lrcName || !hasVocals) return null
      const lrcBuf = Buffer.from(await entries[lrcName].arrayBuffer())
      if (isEnhancedLrc(lrcBuf.slice(0, 512).toString('utf8'))) return null
      // parse artist/title from zip filename (built by buildFilenameBase)
      const base = path.basename(file, '.zip')
      const sep = ' - '
      const idx = base.indexOf(sep)
      const artist = idx >= 0 ? base.slice(0, idx) : ''
      const title = idx >= 0 ? base.slice(idx + sep.length) : base
      return { mediaId, zipPath: file, artist, title }
    } catch {
      return null
    }
  }

  async process ({ file }, pathId) {
    let buffer = await fsPromises.readFile(file)
    let mimeType = fileTypes[getExt(file)].mimeType

    let mediaType: string

    if (getExt(file) === '.zip') {
      const { entries } = await unzip(new Uint8Array(buffer))

      const audioName = Object.keys(entries).find(f => !f.includes('/') && audioExts.includes(getExt(f)))
      if (!audioName) throw new Error(`no valid audio file ${JSON.stringify(audioExts)} found in archive`)

      const cdgName = Object.keys(entries).find(f => !f.includes('/') && getExt(f) === '.cdg')
      const lrcName = Object.keys(entries).find(f => !f.includes('/') && getExt(f) === '.lrc')
      if (!cdgName && !lrcName) throw new Error('no .cdg or .lrc sidecar found in archive')
      mediaType = cdgName ? 'cdg' : 'lrc'

      buffer = Buffer.from(await entries[audioName].arrayBuffer())
      mimeType = fileTypes[getExt(audioName)].mimeType
    } else if (fileTypes[getExt(file)].mimeType.startsWith('audio/')) {
      if (getSidecarName(file, 'cdg')) {
        mediaType = 'cdg'
      } else if (getSidecarName(file, 'lrc')) {
        mediaType = 'lrc'
      } else {
        const pathPrefs = this.paths.entities[pathId]?.prefs
        if (!pathPrefs?.isAudioOnlyEnabled) {
          throw new Error('no .cdg or .lrc sidecar found')
        }
        const { zipPath } = await processAudioOnly(file)
        return this.process({ file: zipPath }, pathId)
      }
    } else {
      mediaType = 'mp4'
    }

    const data = await parseBuffer(buffer, mimeType, {
      duration: true,
      skipCovers: true,
    })

    if (!data.format.duration) {
      throw new Error('could not determine duration')
    }

    log.verbose('  => duration: %s:%s',
      Math.floor(data.format.duration / 60),
      Math.round(data.format.duration % 60).toString().padStart(2, '0'),
    )

    // run MetaParser
    const pathInfo = path.parse(file)
    const parsed = this.parser({
      dir: pathInfo.dir,
      dirSep: path.sep,
      name: pathInfo.name,
      meta: data.common,
    })

    // get artistId and songId
    const match = await (IPC as any).req({ type: LIBRARY_MATCH_SONG, payload: parsed })

    const media = {
      songId: match.songId,
      pathId,
      // normalize relPath to forward slashes with no leading slash
      relPath: file.substring(this.paths.entities[pathId].path.length).replace(/\\/g, '/').replace(/^\//, ''),
      duration: Math.round(data.format.duration),
      mediaType,
      rgTrackGain: data.common.replaygain_track_gain ? data.common.replaygain_track_gain.dB : null,
      rgTrackPeak: data.common.replaygain_track_peak ? data.common.replaygain_track_peak.ratio : null,
    }

    // file already in database?
    const res = Media.search({
      pathId,
      relPath: media.relPath,
    })

    log.verbose('  => %s db result(s)', res.result.length)

    if (res.result.length) {
      const row = res.entities[res.result[0]]
      const diff = {}

      // did anything change?
      Object.keys(media).forEach((key) => {
        if (media[key] !== row[key]) diff[key] = media[key]
      })

      if (Object.keys(diff).length) {
        await (IPC as any).req({
          type: MEDIA_UPDATE,
          payload: {
            mediaId: row.mediaId,
            dateUpdated: Math.round(new Date().getTime() / 1000), // seconds
            ...diff,
          },
        })

        log.info('  => updated: %s', Object.keys(diff).join(', '))
      } else {
        log.info('  => ok')
      }

      return { mediaId: row.mediaId, isNew: false }
    } // end if

    // new media
    ;(media as any).dateAdded = Math.round(new Date().getTime() / 1000) // seconds
    log.info('  => new: %s', JSON.stringify(match))

    return {
      mediaId: await (IPC as any).req({ type: MEDIA_ADD, payload: media }),
      isNew: true,
    }
  }

  async removeInvalid (pathId, validMediaIds = []) {
    const res = Media.search({ pathId })
    const invalid = res.result.filter(mediaId => !validMediaIds.includes(mediaId))

    if (invalid.length) {
      await (IPC as any).req({ type: MEDIA_REMOVE, payload: invalid })
    }

    return invalid.length
  }
}

export default FileScanner
