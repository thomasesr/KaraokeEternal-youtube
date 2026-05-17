import sql from 'sqlate'
import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'
import PushNotifications from '../PushNotifications/PushNotifications.js'
import Rooms from '../Rooms/Rooms.js'
import Scoring from './Scoring.js'
import {
  SCORING_START_REQUEST,
  SCORING_VOTE_REQUEST,
  SCORING_CANCEL_REQUEST,
  SCORING_PUSH_REQUEST,
  SCORING_START,
  SCORING_RESULT,
  HIGH_SCORES_REQUEST,
  HIGH_SCORES_PUSH,
  _ERROR,
} from '../../shared/actionTypes.js'

const log = getLogger('Scoring')

const ACTION_HANDLERS = {
  [SCORING_START_REQUEST]: (sock, { payload }, acknowledge) => {
    if (!sock._lastPlayerStatus) {
      return acknowledge({ type: SCORING_START_REQUEST + _ERROR, error: 'Not a player socket' })
    }

    const roomId: number = sock.user.roomId
    const { queueId, songId, singerUserId, duration } = payload as {
      queueId: number
      songId: number
      singerUserId: number
      duration: number
    }

    const clampedDuration = Math.min(30, Math.max(5, duration || 15))

    Scoring.start(roomId, { queueId, songId, singerUserId, duration: clampedDuration }, (result) => {
      Scoring.persistResult(result, roomId)

      sock.server.to(Rooms.prefix(roomId)).emit('action', {
        type: SCORING_RESULT,
        payload: {
          queueId: result.queueId,
          median: result.median,
          voteCount: result.voteCount,
          wasSkipped: result.wasSkipped,
        },
      })

      log.info('SCORING_RESULT emitted roomId=%s median=%s votes=%s skipped=%s',
        roomId, result.median, result.voteCount, result.wasSkipped)
    })

    const endsAt = Date.now() + clampedDuration * 1000

    sock.server.to(Rooms.prefix(roomId)).emit('action', {
      type: SCORING_START,
      payload: { queueId, songId, singerUserId, endsAt, duration: clampedDuration },
    })

    acknowledge({ type: SCORING_START_REQUEST + '_SUCCESS' })
  },

  [SCORING_VOTE_REQUEST]: (sock, { payload }, acknowledge) => {
    const roomId: number = sock.user.roomId
    const { score } = payload as { score: number }

    if (typeof score !== 'number' || score < 0.5 || score > 5 || (score * 2) % 1 !== 0) {
      return acknowledge({ type: SCORING_VOTE_REQUEST + _ERROR, error: 'Invalid score' })
    }

    const outcome = Scoring.addVote(roomId, sock.user.userId, score)

    if (outcome === 'own_song') {
      return acknowledge({ type: SCORING_VOTE_REQUEST + _ERROR, error: 'own_song' })
    }
    if (outcome === 'no_session') {
      return acknowledge({ type: SCORING_VOTE_REQUEST + _ERROR, error: 'No active scoring session' })
    }

    acknowledge({ type: SCORING_VOTE_REQUEST + '_SUCCESS' })
  },

  [SCORING_CANCEL_REQUEST]: (sock, _action, acknowledge) => {
    if (!sock._lastPlayerStatus) {
      return acknowledge({ type: SCORING_CANCEL_REQUEST + _ERROR, error: 'Not a player socket' })
    }

    Scoring.markSkipped(sock.user.roomId)
    acknowledge({ type: SCORING_CANCEL_REQUEST + '_SUCCESS' })
  },

  [SCORING_PUSH_REQUEST]: async (sock, _action, acknowledge) => {
    if (!sock._lastPlayerStatus) {
      return acknowledge({ type: SCORING_PUSH_REQUEST + _ERROR, error: 'Not a player socket' })
    }

    const roomId: number = sock.user.roomId
    const userIds = Rooms.getRoomUsers(roomId)

    // fire-and-forget; push failures are logged inside sendToUser
    PushNotifications.sendToRoomUsers(userIds, 'notifScoringTitle', 'notifScoringBody').catch(() => {})
    acknowledge({ type: SCORING_PUSH_REQUEST + '_SUCCESS' })
  },

  [HIGH_SCORES_REQUEST]: (sock, _action, acknowledge) => {
    const roomId: number = sock.user.roomId

    const today = "date('now','localtime')"

    const todaySongsQuery = sql`
      SELECT sc.songId,
             AVG(sc.median)    AS avgScore,
             SUM(sc.voteCount) AS totalVotes,
             COUNT(*)          AS timesPlayed,
             sg.title          AS title,
             ar.name           AS artistName,
             (SELECT u.name FROM songScores s2
                JOIN users u ON u.userId = s2.userId
              WHERE s2.songId = sc.songId
                AND s2.roomId = ${roomId}
                AND s2.voteCount > 0
                AND date(s2.scoredAt, 'unixepoch') = date('now', 'localtime')
              ORDER BY s2.median DESC
              LIMIT 1)         AS singerName
      FROM songScores sc
        JOIN songs sg ON sg.songId = sc.songId
        JOIN artists ar ON ar.artistId = sg.artistId
      WHERE sc.roomId = ${roomId}
        AND sc.voteCount > 0
        AND date(sc.scoredAt, 'unixepoch') = date('now', 'localtime')
      GROUP BY sc.songId
      ORDER BY avgScore DESC, totalVotes DESC
      LIMIT 20
    `

    const todayUsersQuery = sql`
      SELECT sc.userId,
             u.name           AS name,
             SUM(sc.median)   AS totalScore,
             COUNT(*)         AS songCount
      FROM songScores sc
        JOIN users u ON u.userId = sc.userId
      WHERE sc.roomId = ${roomId}
        AND sc.voteCount > 0
        AND date(sc.scoredAt, 'unixepoch') = date('now', 'localtime')
      GROUP BY sc.userId
      ORDER BY totalScore DESC
      LIMIT 20
    `

    const allTimeUsersQuery = sql`
      SELECT sc.userId,
             u.name          AS name,
             SUM(sc.median)  AS totalScore,
             COUNT(*)        AS songCount
      FROM songScores sc
        JOIN users u ON u.userId = sc.userId
      WHERE sc.voteCount > 0
      GROUP BY sc.userId
      ORDER BY totalScore DESC
      LIMIT 20
    `

    const todaySongs = db.all<{
      songId: number; avgScore: number; totalVotes: number; timesPlayed: number
      title: string; artistName: string; singerName: string | null
    }>(String(todaySongsQuery), todaySongsQuery.parameters)

    const todayUsers = db.all<{
      userId: number; name: string; totalScore: number; songCount: number
    }>(String(todayUsersQuery), todayUsersQuery.parameters)

    const allTimeUsers = db.all<{
      userId: number; name: string; totalScore: number; songCount: number
    }>(String(allTimeUsersQuery), allTimeUsersQuery.parameters)

    sock.server.to(sock.id).emit('action', {
      type: HIGH_SCORES_PUSH,
      payload: { todaySongs, todayUsers, allTimeUsers },
    })

    acknowledge({ type: HIGH_SCORES_REQUEST + '_SUCCESS' })
  },
}

export default ACTION_HANDLERS
