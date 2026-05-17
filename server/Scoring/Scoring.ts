import sql from 'sqlate'
import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'

const log = getLogger('Scoring')

interface ScoringSession {
  queueId: number
  songId: number
  singerUserId: number
  wasSkipped: boolean
  endsAt: number
  votes: Map<number, number>
  timer: ReturnType<typeof setTimeout>
}

export interface ScoringResult {
  median: number
  voteCount: number
  wasSkipped: boolean
  songId: number
  queueId: number
  singerUserId: number
}

class Scoring {
  private static sessions = new Map<number, ScoringSession>()

  static start (
    roomId: number,
    opts: { queueId: number; songId: number; singerUserId: number; duration: number },
    onComplete: (result: ScoringResult) => void,
  ): void {
    const existing = this.sessions.get(roomId)
    if (existing) {
      clearTimeout(existing.timer)
      this.sessions.delete(roomId)
    }

    const { queueId, songId, singerUserId, duration } = opts
    const endsAt = Date.now() + duration * 1000

    const timer = setTimeout(() => {
      const result = this.end(roomId)
      onComplete(result)
    }, duration * 1000)

    this.sessions.set(roomId, {
      queueId,
      songId,
      singerUserId,
      wasSkipped: false,
      endsAt,
      votes: new Map(),
      timer,
    })

    log.info('scoring started roomId=%s queueId=%s duration=%ss', roomId, queueId, duration)
  }

  static markSkipped (roomId: number): void {
    const session = this.sessions.get(roomId)
    if (session) {
      session.wasSkipped = true
      log.info('scoring marked skipped roomId=%s', roomId)
    }
  }

  static addVote (roomId: number, userId: number, score: number): 'ok' | 'own_song' | 'no_session' {
    const session = this.sessions.get(roomId)
    if (!session) return 'no_session'
    if (userId === session.singerUserId) return 'own_song'

    session.votes.set(userId, score)
    log.verbose('vote added roomId=%s userId=%s score=%s', roomId, userId, score)
    return 'ok'
  }

  static cancel (roomId: number): void {
    const session = this.sessions.get(roomId)
    if (session) {
      clearTimeout(session.timer)
      this.sessions.delete(roomId)
      log.info('scoring cancelled roomId=%s', roomId)
    }
  }

  static end (roomId: number): ScoringResult {
    const session = this.sessions.get(roomId)

    if (!session) {
      return { median: 0, voteCount: 0, wasSkipped: true, songId: 0, queueId: 0, singerUserId: 0 }
    }

    clearTimeout(session.timer)
    this.sessions.delete(roomId)

    const { queueId, songId, singerUserId, wasSkipped, votes } = session

    if (wasSkipped) {
      log.info('scoring ended (skipped) roomId=%s', roomId)
      return { median: 0, voteCount: 0, wasSkipped: true, songId, queueId, singerUserId }
    }

    const voteValues = Array.from(votes.values())

    if (voteValues.length === 0) {
      log.info('scoring ended (no votes → auto 5 stars) roomId=%s', roomId)
      return { median: 5, voteCount: 0, wasSkipped: false, songId, queueId, singerUserId }
    }

    const median = this.computeMedian(voteValues)
    log.info('scoring ended roomId=%s votes=%s median=%s', roomId, voteValues.length, median)
    return { median, voteCount: voteValues.length, wasSkipped: false, songId, queueId, singerUserId }
  }

  static persistResult (result: ScoringResult, roomId: number): void {
    if (result.wasSkipped) return

    const now = Math.floor(Date.now() / 1000)
    const query = sql`
      INSERT INTO songScores (queueId, songId, userId, roomId, median, voteCount, scoredAt)
      VALUES (${result.queueId}, ${result.songId}, ${result.singerUserId}, ${roomId}, ${result.median}, ${result.voteCount}, ${now})
    `
    db.run(String(query), query.parameters)
    log.info('persisted score roomId=%s songId=%s median=%s voteCount=%s', roomId, result.songId, result.median, result.voteCount)
  }

  private static computeMedian (votes: number[]): number {
    const sorted = [...votes].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2
    }
    return sorted[mid]
  }
}

export default Scoring
