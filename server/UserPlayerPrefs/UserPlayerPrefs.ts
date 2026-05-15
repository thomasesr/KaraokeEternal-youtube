import { db } from '../lib/Database.js'

export interface UserPlayerPrefsData {
  lrcFontSize: number
  lrcDefaultOffset: number
  isReplayGainEnabled: boolean
}

const DEFAULTS: UserPlayerPrefsData = {
  lrcFontSize: 1,
  lrcDefaultOffset: 0,
  isReplayGainEnabled: false,
}

const ALLOWED_KEYS = new Set(['lrcFontSize', 'lrcDefaultOffset', 'isReplayGainEnabled'])

export default {
  get (userId: number): UserPlayerPrefsData {
    const row = db.get<{ lrcFontSize: number; lrcDefaultOffset: number; isReplayGainEnabled: number }>(
      'SELECT lrcFontSize, lrcDefaultOffset, isReplayGainEnabled FROM userPlayerPrefs WHERE userId = ?',
      [userId],
    )
    if (!row) return { ...DEFAULTS }
    return {
      lrcFontSize: row.lrcFontSize,
      lrcDefaultOffset: row.lrcDefaultOffset,
      isReplayGainEnabled: Boolean(row.isReplayGainEnabled),
    }
  },

  set (userId: number, key: string, data: unknown): void {
    if (!ALLOWED_KEYS.has(key)) throw new Error(`unknown player pref key: ${key}`)
    db.run(
      `INSERT INTO userPlayerPrefs (userId, ${key}) VALUES (?, ?)
       ON CONFLICT(userId) DO UPDATE SET ${key} = excluded.${key}`,
      [userId, data],
    )
  },
}
