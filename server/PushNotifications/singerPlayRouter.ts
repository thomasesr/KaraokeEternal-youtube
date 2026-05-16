import KoaRouter from '@koa/router'
import Rooms from '../Rooms/Rooms.js'
import Queue from '../Queue/Queue.js'
import getLogger from '../lib/Log.js'
import { PLAYER_CMD_PLAY } from '../../shared/actionTypes.js'

const log = getLogger('singerPlay')
const router = new KoaRouter({ prefix: '/api' })

router.post('/singer-play', (ctx) => {
  const { userId, roomId, isAdmin, role } = ctx.user

  if (!userId) {
    ctx.throw(401)
  }

  if (typeof roomId !== 'number') {
    ctx.throw(403, 'Not in a room')
  }

  const isRoomManager = role === 'room_manager' && Rooms.isManager(roomId, userId)

  if (!isAdmin && !isRoomManager) {
    // Find the player socket for this room and check who owns the waiting queue item
    let waitingQueueId: number | null = null

    for (const s of ctx.io.of('/').sockets.values()) {
      const sock = s as any
      if (sock.user?.roomId === roomId && sock._lastPlayerStatus?.isWaitingForSinger) {
        waitingQueueId = sock._lastPlayerStatus.queueId ?? null
        break
      }
    }

    if (waitingQueueId === null) {
      ctx.throw(403, 'Player is not waiting for a singer')
    }

    const singerUserId = Queue.getUserIdForQueueItem(waitingQueueId)

    if (singerUserId !== userId) {
      ctx.throw(403, 'Not your turn')
    }
  }

  log.verbose('singer-play triggered by userId %s in room %s', userId, roomId)

  ctx.io.to(Rooms.prefix(roomId)).emit('action', {
    type: PLAYER_CMD_PLAY,
  })

  ctx.status = 204
})

export default router
