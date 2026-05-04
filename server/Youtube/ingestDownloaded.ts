import { promises as fsp } from 'fs'
import path from 'path'
import getLogger from '../lib/Log.js'
import Library from '../Library/Library.js'
import Media from '../Media/Media.js'
import Queue from '../Queue/Queue.js'
import Rooms from '../Rooms/Rooms.js'
import MetaParser from '../Scanner/MetaParser/MetaParser.js'
import pushQueuesAndLibrary from '../lib/pushQueuesAndLibrary.js'

const log = getLogger('Youtube')

export interface IngestArgs {
  absPath: string | null
  duration: number
  artist: string
  title: string
  pathId: number
  destDir: string
  roomId: number
  userId: number
  mediaType?: 'mp4' | 'lrc'
  io?: any
}

export async function ingestDownloaded (args: IngestArgs): Promise<void> {
  if (!args.absPath) throw new Error('yt-dlp did not report final filepath')

  log.verbose('ingest start: %s artist=%s title=%s pathId=%d roomId=%d', args.absPath, args.artist, args.title, args.pathId, args.roomId)
  log.debug('ingest args: duration=%d mediaType=%s userId=%d destDir=%s', args.duration, args.mediaType ?? 'unset', args.userId, args.destDir)

  try {
    await Rooms.validate(args.roomId, undefined, { validatePassword: false })
    log.debug('ingest room %d validated', args.roomId)
  } catch (e) {
    await fsp.unlink(args.absPath).catch(() => undefined)
    throw new Error(`Room no longer available (${(e as Error).message}); downloaded file removed`)
  }

  const relPath = path.relative(args.destDir, args.absPath).replace(/\\/g, '/').replace(/^\/+/, '')
  if (!relPath || relPath.startsWith('..')) {
    throw new Error(`downloaded file is outside dest dir: ${args.absPath}`)
  }
  log.debug('ingest relPath=%s', relPath)

  const parser = MetaParser({})
  const parsed = parser({ name: `${args.artist} - ${args.title}`, file: args.absPath })
  log.debug('ingest parsed: artist=%s title=%s artistNorm=%s titleNorm=%s', parsed.artist, parsed.title, parsed.artistNorm, parsed.titleNorm)

  const match = Library.matchSong({
    artist: parsed.artist,
    artistNorm: parsed.artistNorm,
    title: parsed.title,
    titleNorm: parsed.titleNorm,
  })
  log.debug('ingest library match: songId=%s', match.songId ?? 'none')

  if (!match.songId) throw new Error('Library.matchSong returned no songId')

  const mediaRow: Record<string, unknown> = {
    songId: match.songId,
    pathId: args.pathId,
    relPath,
    duration: args.duration,
    dateAdded: Math.floor(Date.now() / 1000),
  }
  if (args.mediaType) mediaRow.mediaType = args.mediaType
  log.debug('ingest media row: %j', mediaRow)

  Media.add(mediaRow)
  log.debug('ingest Media.add done, adding to queue roomId=%d songId=%d userId=%d', args.roomId, match.songId, args.userId)

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
