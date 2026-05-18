import { db } from '../lib/Database.js'
import sql from 'sqlate'
import getLogger from '../lib/Log.js'
import { searchByArtistTitle } from './MusicBrainz.js'
import Prefs from '../Prefs/Prefs.js'
import { MB_TAG_STATUS } from '../../shared/actionTypes.js'
import type { IYoutubePrefs } from '../../shared/types.js'

const log = getLogger('MusicBrainzQueue')

let isRunning = false

export async function runMusicBrainzQueue (io: any): Promise<void> {
  if (isRunning) {
    log.warn('MusicBrainzQueue already running, skipping')
    return
  }

  const query = sql`
    SELECT songs.songId, songs.title, artists.name AS artist
    FROM songs
    INNER JOIN artists USING (artistId)
    WHERE songs.mbId IS NULL
  `
  const songs = db.all<{ songId: number, title: string, artist: string }>(String(query), query.parameters)

  if (songs.length === 0) {
    log.info('MusicBrainzQueue: no untagged songs')
    return
  }

  isRunning = true
  log.info('MusicBrainzQueue: processing %d songs', songs.length)

  const emitStatus = (isTagging: boolean, pct: number, text: string) => {
    io.emit('action', { type: MB_TAG_STATUS, payload: { isTagging, pct, text } })
  }

  emitStatus(true, 0, `Tagging songs with MusicBrainz IDs (0 of ${songs.length})`)

  const ytPrefs = (Prefs.get() as any)?.youtube as Partial<IYoutubePrefs> | undefined
  const minScore = typeof ytPrefs?.musicbrainzMinScore === 'number' ? ytPrefs.musicbrainzMinScore : 80

  let tagged = 0

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i]
    const label = `${song.artist} - ${song.title}`
    emitStatus(true, (i / songs.length) * 100, `Tagging (${i + 1} of ${songs.length}): ${label}`)

    try {
      const hit = await searchByArtistTitle(song.artist, song.title)
      if (hit && hit.id && hit.score >= minScore) {
        const update = sql`UPDATE songs SET mbId = ${hit.id} WHERE songId = ${song.songId}`
        db.run(String(update), update.parameters)
        tagged++
        log.verbose('tagged %s → %s (score %d)', label, hit.id, hit.score)
      } else {
        log.verbose('no tag for %s (score %s)', label, hit?.score ?? 'null')
      }
    } catch (e) {
      log.warn('MusicBrainzQueue: failed for %s: %s', label, (e as Error).message)
    }
  }

  isRunning = false
  emitStatus(false, 100, `MusicBrainz tagging done (${tagged} of ${songs.length} tagged)`)
  log.info('MusicBrainzQueue: done, tagged %d of %d', tagged, songs.length)
}
