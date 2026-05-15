import KoaRouter from '@koa/router'
import getLogger from '../lib/Log.js'
import PushNotifications from './PushNotifications.js'
import type { PushSubscriptionData } from './PushNotifications.js'

interface RequestWithBody<T = Record<string, unknown>> { body: T }

const log = getLogger('PushNotifications')
const router = new KoaRouter({ prefix: '/api/push' })

router.get('/vapid-public-key', (ctx) => {
  log.info('GET /vapid-public-key — userId: %s', ctx.user.userId ?? 'unauthenticated')
  const key = PushNotifications.getPublicKey()
  log.info('returning VAPID public key (length %s)', key.length)
  ctx.body = { publicKey: key }
})

router.post('/subscribe', (ctx) => {
  log.info('POST /subscribe — userId: %s', ctx.user.userId ?? 'unauthenticated')
  if (!ctx.user.userId) {
    log.warn('subscribe rejected: no userId in token')
    ctx.throw(401)
  }

  const sub = (ctx.request as unknown as RequestWithBody<PushSubscriptionData>).body
  log.info('subscribe body endpoint: %s', sub?.endpoint ?? '(missing)')

  if (!sub?.endpoint || !sub?.keys?.auth || !sub?.keys?.p256dh) {
    log.warn('subscribe rejected: invalid subscription object — endpoint=%s auth=%s p256dh=%s',
      !!sub?.endpoint, !!sub?.keys?.auth, !!sub?.keys?.p256dh)
    ctx.throw(422, 'Invalid subscription object')
  }

  PushNotifications.subscribe(ctx.user.userId, sub)
  log.info('userId %s push subscription saved', ctx.user.userId)
  ctx.status = 204
})

router.post('/send', async (ctx) => {
  if (!ctx.user.userId) ctx.throw(401)
  if (!ctx.user.isAdmin && ctx.user.role !== 'room_manager') ctx.throw(403)

  const { userId, title, body, actions } = (ctx.request as unknown as RequestWithBody<{
    userId: number
    title: string
    body: string
    actions?: Array<{ action: string; title: string }>
  }>).body

  if (!userId || !title || !body) ctx.throw(422, 'userId, title, body required')

  await PushNotifications.sendToUser(userId, title, body, actions)
  ctx.status = 204
})

router.delete('/unsubscribe', (ctx) => {
  if (!ctx.user.userId) {
    ctx.throw(401)
  }

  const { endpoint } = (ctx.request as unknown as RequestWithBody<{ endpoint: string }>).body

  if (!endpoint) {
    ctx.throw(422, 'endpoint required')
  }

  PushNotifications.unsubscribe(ctx.user.userId, endpoint)
  ctx.status = 204
})

export default router
