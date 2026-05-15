import KoaRouter from '@koa/router'
import getLogger from '../lib/Log.js'
import PushNotifications from './PushNotifications.js'
import type { PushSubscriptionData } from './PushNotifications.js'

interface RequestWithBody<T = Record<string, unknown>> { body: T }

const log = getLogger('PushNotifications')
const router = new KoaRouter({ prefix: '/api/push' })

router.get('/vapid-public-key', (ctx) => {
  ctx.body = { publicKey: PushNotifications.getPublicKey() }
})

router.post('/subscribe', (ctx) => {
  if (!ctx.user.userId) {
    ctx.throw(401)
  }

  const sub = (ctx.request as unknown as RequestWithBody<PushSubscriptionData>).body

  if (!sub?.endpoint || !sub?.keys?.auth || !sub?.keys?.p256dh) {
    ctx.throw(422, 'Invalid subscription object')
  }

  PushNotifications.subscribe(ctx.user.userId, sub)
  log.verbose('userId %s subscribed to push', ctx.user.userId)
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
