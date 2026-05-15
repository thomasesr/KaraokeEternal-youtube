import Rooms from '../Rooms/Rooms.js'
import PushNotifications from '../PushNotifications/PushNotifications.js'
import getLogger from '../lib/Log.js'

import {
  PLAYER_CMD_NEXT,
  PLAYER_CMD_OPTIONS,
  PLAYER_CMD_PAUSE,
  PLAYER_CMD_PLAY,
  PLAYER_CMD_REPLAY,
  PLAYER_CMD_VOLUME,
  PLAYER_REQ_NEXT,
  PLAYER_REQ_OPTIONS,
  PLAYER_REQ_PAUSE,
  PLAYER_REQ_PLAY,
  PLAYER_REQ_REPLAY,
  PLAYER_REQ_VOLUME,
  PLAYER_EMIT_STATUS,
  PLAYER_EMIT_LEAVE,
  PLAYER_EMIT_LEAD_WARN,
  PLAYER_STATUS,
  PLAYER_LEAVE,
} from '../../shared/actionTypes.js'

const log = getLogger('Player')

// per-room timers for "still waiting" second push
const waitingTimers: Map<number, ReturnType<typeof setTimeout>> = new Map()

function clearWaitingTimer (roomId: number): void {
  const t = waitingTimers.get(roomId)
  if (t) {
    clearTimeout(t)
    waitingTimers.delete(roomId)
  }
}

// ------------------------------------
// Action Handlers
// ------------------------------------
const ACTION_HANDLERS = {
  [PLAYER_REQ_OPTIONS]: (sock, { payload }) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_OPTIONS,
      payload,
    })
  },
  [PLAYER_REQ_NEXT]: (sock) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_NEXT,
    })
  },
  [PLAYER_REQ_PAUSE]: (sock) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_PAUSE,
    })
  },
  [PLAYER_REQ_PLAY]: (sock) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_PLAY,
    })
  },
  [PLAYER_REQ_REPLAY]: (sock, { payload }) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_REPLAY,
      payload,
    })
  },
  [PLAYER_REQ_VOLUME]: (sock, { payload }) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_VOLUME,
      payload,
    })
  },
  [PLAYER_EMIT_STATUS]: (sock, { payload }) => {
    const roomId: number = sock.user.roomId
    const prev = sock._lastPlayerStatus

    // so we can tell the room when players leave and
    // relay last known player status on client join
    sock._lastPlayerStatus = payload

    sock.server.to(Rooms.prefix(roomId)).emit('action', {
      type: PLAYER_STATUS,
      payload,
    })

    const nextUserId: number | null = payload.nextUserId ?? null
    const isWaiting: boolean = !!payload.isWaitingForSinger

    if (isWaiting && nextUserId !== null) {
      const prevWaiting: boolean = !!prev?.isWaitingForSinger
      const prevNextUser: number | null = prev?.nextUserId ?? null

      if (!prevWaiting || prevNextUser !== nextUserId) {
        // song just ended and we're waiting — fire first push immediately
        PushNotifications.sendToUser(
          nextUserId,
          'It\'s your turn to sing!',
          'Step up and press Play when ready.',
          [{ action: 'play-now', title: 'Play Now' }],
        ).catch(err => log.error('push send error: %s', err.message))

        // schedule second push after 10s if still waiting
        clearWaitingTimer(roomId)
        const timer = setTimeout(() => {
          waitingTimers.delete(roomId)
          // re-check: still waiting for the same user?
          const currentStatus = sock._lastPlayerStatus
          if (currentStatus?.isWaitingForSinger && currentStatus?.nextUserId === nextUserId) {
            PushNotifications.sendToUser(
              nextUserId,
              'Still waiting for you!',
              'The room is ready. Press Play to start.',
              [{ action: 'play-now', title: 'Play Now' }],
            ).catch(err => log.error('push send error: %s', err.message))
          }
        }, 10_000)

        waitingTimers.set(roomId, timer)
      }
    } else {
      // no longer waiting — cancel any pending reminder
      clearWaitingTimer(roomId)
    }
  },
  [PLAYER_EMIT_LEAVE]: (sock) => {
    sock._lastPlayerStatus = null
    clearWaitingTimer(sock.user.roomId)

    // any players left in room?
    if (!Rooms.isPlayerPresent(sock.server, sock.user.roomId)) {
      sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
        type: PLAYER_LEAVE,
        payload: { socketId: sock.id },
      })
    }
  },
  [PLAYER_EMIT_LEAD_WARN]: async (sock, { payload }) => {
    const nextUserId: number | null = payload?.nextUserId ?? null
    if (nextUserId === null) return

    log.verbose('lead warn for userId %s in room %s', nextUserId, sock.user.roomId)

    PushNotifications.sendToUser(
      nextUserId,
      'You\'re up next!',
      'Get ready — your song is starting soon.',
    ).catch(err => log.error('push send error: %s', err.message))
  },
}

export default ACTION_HANDLERS
