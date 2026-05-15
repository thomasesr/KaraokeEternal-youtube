import { LRC_ENHANCE_QUEUE } from '../../shared/actionTypes.js'
import { runEnhancedLrcQueue } from './EnhancedLrcQueue.js'

export default function (io: any) {
  return {
    [LRC_ENHANCE_QUEUE]: ({ payload }: { payload: { candidates: any[] } }) => {
      runEnhancedLrcQueue(payload.candidates, io).catch(() => {})
    },
  }
}
