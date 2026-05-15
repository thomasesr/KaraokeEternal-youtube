import Library from './Library.js'
import throttle from '@jcoreio/async-throttle'
import { SCANNER_WORKER_STATUS, LIBRARY_MATCH_SONG, LRC_ENHANCE_STATUS } from '../../shared/actionTypes.js'

/**
 * IPC action handlers
 */
export default function (io) {
  const emit = throttle(action => io.emit('action', action), 1000)

  return {
    [LIBRARY_MATCH_SONG]: ({ payload }) => Library.matchSong(payload),
    [SCANNER_WORKER_STATUS]: action => emit(action),
    [LRC_ENHANCE_STATUS]: action => io.emit('action', action),
  }
}
