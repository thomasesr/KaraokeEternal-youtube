import webpush from 'web-push'
import sql from 'sqlate'
import { db } from '../lib/Database.js'
import Prefs from '../Prefs/Prefs.js'
import getLogger from '../lib/Log.js'

const log = getLogger('PushNotifications')

export interface PushSubscriptionKeys {
  auth: string
  p256dh: string
}

export interface PushSubscriptionData {
  endpoint: string
  expirationTime?: number | null
  keys: PushSubscriptionKeys
}

class PushNotifications {
  private static initialized = false

  static init (): void {
    if (this.initialized) return

    let publicKey = Prefs.getSystemPref('vapidPublicKey')
    let privateKey = Prefs.getSystemPref('vapidPrivateKey')

    if (!publicKey || !privateKey) {
      const keys = webpush.generateVAPIDKeys()
      publicKey = keys.publicKey
      privateKey = keys.privateKey
      Prefs.setSystemPref('vapidPublicKey', publicKey)
      Prefs.setSystemPref('vapidPrivateKey', privateKey)
      log.info('Generated new VAPID key pair')
    }

    webpush.setVapidDetails(
      'mailto:admin@karaokeforever.app',
      publicKey,
      privateKey,
    )

    this.initialized = true
  }

  static getPublicKey (): string {
    this.init()
    return Prefs.getSystemPref('vapidPublicKey') as string
  }

  static subscribe (userId: number, subscription: PushSubscriptionData): void {
    this.init()
    const { endpoint, expirationTime, keys } = subscription
    const now = Math.floor(Date.now() / 1000)

    const query = sql`
      INSERT INTO pushSubscriptions (userId, endpoint, expirationTime, auth, p256dh, createdAt)
      VALUES (${userId}, ${endpoint}, ${expirationTime ?? null}, ${keys.auth}, ${keys.p256dh}, ${now})
      ON CONFLICT(endpoint) DO UPDATE SET
        userId = excluded.userId,
        expirationTime = excluded.expirationTime,
        auth = excluded.auth,
        p256dh = excluded.p256dh,
        createdAt = excluded.createdAt
    `
    db.run(String(query), query.parameters)
    log.verbose('push subscription saved for userId %s', userId)
  }

  static unsubscribe (userId: number, endpoint: string): void {
    const query = sql`
      DELETE FROM pushSubscriptions
      WHERE userId = ${userId} AND endpoint = ${endpoint}
    `
    db.run(String(query), query.parameters)
    log.verbose('push subscription removed for userId %s', userId)
  }

  static async sendToUser (userId: number, title: string, body: string, actions?: webpush.NotificationAction[]): Promise<void> {
    this.init()

    const query = sql`
      SELECT endpoint, expirationTime, auth, p256dh
      FROM pushSubscriptions
      WHERE userId = ${userId}
    `
    const rows = db.all<{
      endpoint: string
      expirationTime: number | null
      auth: string
      p256dh: string
    }>(String(query), query.parameters)

    if (rows.length === 0) return

    const payload = JSON.stringify({ title, body, actions: actions ?? [] })

    const sends = rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            expirationTime: row.expirationTime ?? undefined,
            keys: { auth: row.auth, p256dh: row.p256dh },
          },
          payload,
        )
      } catch (err) {
        const webPushErr = err as { statusCode?: number, message?: string }
        if (webPushErr.statusCode === 410 || webPushErr.statusCode === 404) {
          // subscription expired or invalid — clean it up
          const delQuery = sql`DELETE FROM pushSubscriptions WHERE endpoint = ${row.endpoint}`
          db.run(String(delQuery), delQuery.parameters)
          log.verbose('removed expired push subscription: %s', row.endpoint)
        } else {
          log.error('push send error for userId %s: %s', userId, webPushErr.message)
        }
      }
    })

    await Promise.all(sends)
  }
}

export default PushNotifications
