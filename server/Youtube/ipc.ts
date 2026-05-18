import { LRC_ENHANCE_QUEUE, MB_TAG_QUEUE } from '../../shared/actionTypes.js'
import { runEnhancedLrcQueue } from './EnhancedLrcQueue.js'
import { runMusicBrainzQueue } from './MusicBrainzQueue.js'

export default function (io: any) {
  return {
    [LRC_ENHANCE_QUEUE]: ({ payload }: { payload: { candidates: any[] } }) => {
      runEnhancedLrcQueue(payload.candidates, io).catch(() => {})
    },
    [MB_TAG_QUEUE]: () => {
      runMusicBrainzQueue(io).catch(() => {})
    },
  }
}
