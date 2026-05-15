import { createAction, createReducer } from '@reduxjs/toolkit'
import type { AppThunk } from 'store/store'

// ------------------------------------
// Actions
// ------------------------------------
const subscribeSuccess = createAction('push/SUBSCRIBE_SUCCESS')
const subscribeFail = createAction<string>('push/SUBSCRIBE_FAIL')
const unsubscribeSuccess = createAction('push/UNSUBSCRIBE_SUCCESS')

// ------------------------------------
// Thunks
// ------------------------------------
export function subscribePush (): AppThunk {
  return async (dispatch) => {
    console.log('[push] subscribePush() called')
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('[push] serviceWorker or PushManager not supported')
        dispatch(subscribeFail('Push notifications not supported in this browser'))
        return
      }
      console.log('[push] serviceWorker and PushManager supported')

      if ('Notification' in window) {
        console.log('[push] Notification.permission =', Notification.permission)
        if (Notification.permission === 'denied') {
          console.warn('[push] permission denied — aborting')
          return
        }
        if (Notification.permission === 'default') {
          console.log('[push] requesting permission...')
          const perm = await Notification.requestPermission()
          console.log('[push] permission result:', perm)
          if (perm !== 'granted') return
        }
      } else {
        console.warn('[push] Notification API not available')
      }

      const swUrl = new URL('sw.js', document.baseURI).href
      console.log('[push] registering SW at', swUrl, 'scope', new URL('.', document.baseURI).href)
      const registration = await navigator.serviceWorker.register(swUrl, {
        scope: new URL('.', document.baseURI).href,
      })
      console.log('[push] SW registered, state:', registration.active?.state ?? 'no active worker')

      console.log('[push] waiting for SW ready...')
      await navigator.serviceWorker.ready
      console.log('[push] SW ready')

      const existing = await registration.pushManager.getSubscription()
      if (existing) {
        console.log('[push] already subscribed:', existing.endpoint)
        dispatch(subscribeSuccess())
        return
      }

      const base = document.baseURI
      console.log('[push] document.baseURI =', base)
      console.log('[push] fetching VAPID public key from', `${base}api/push/vapid-public-key`)
      const keyRes = await fetch(`${base}api/push/vapid-public-key`, { credentials: 'include' })
      console.log('[push] VAPID key response status:', keyRes.status)
      if (!keyRes.ok) throw new Error(`Failed to get VAPID public key: ${keyRes.status}`)
      const { publicKey } = await keyRes.json()
      console.log('[push] VAPID public key received (length', publicKey?.length, ')')

      console.log('[push] calling pushManager.subscribe()...')
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      console.log('[push] subscribed, endpoint:', subscription.endpoint)

      console.log('[push] saving subscription to server...')
      const res = await fetch(`${base}api/push/subscribe`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      console.log('[push] subscribe POST response status:', res.status)
      if (!res.ok) throw new Error(`Failed to save push subscription: ${res.status}`)

      console.log('[push] subscribe complete ✓')
      dispatch(subscribeSuccess())
    } catch (err) {
      console.error('[push] subscribePush error:', err)
      dispatch(subscribeFail(err instanceof Error ? err.message : 'Unknown error'))
    }
  }
}

export function unsubscribePush (): AppThunk {
  return async (dispatch) => {
    console.log('[push] unsubscribePush() called')
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) {
        console.log('[push] no SW registration found')
        dispatch(unsubscribeSuccess())
        return
      }

      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        console.log('[push] no push subscription found')
        dispatch(unsubscribeSuccess())
        return
      }

      console.log('[push] unsubscribing endpoint:', subscription.endpoint)
      await fetch(`${document.baseURI}api/push/unsubscribe`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })

      await subscription.unsubscribe()
      console.log('[push] unsubscribed ✓')
      dispatch(unsubscribeSuccess())
    } catch (err) {
      console.error('[push] unsubscribePush error:', err)
    }
  }
}

export async function isPushSubscribed (): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return false
  const sub = await registration.pushManager.getSubscription()
  return !!sub
}

// ------------------------------------
// Reducer
// ------------------------------------
interface PushState {
  isSubscribed: boolean
  isSubscribing: boolean
  error: string | null
}

const initialState: PushState = {
  isSubscribed: false,
  isSubscribing: false,
  error: null,
}

const pushReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(subscribeSuccess, (state) => {
      state.isSubscribed = true
      state.isSubscribing = false
      state.error = null
    })
    .addCase(subscribeFail, (state, { payload }) => {
      state.isSubscribed = false
      state.isSubscribing = false
      state.error = payload
    })
    .addCase(unsubscribeSuccess, (state) => {
      state.isSubscribed = false
      state.isSubscribing = false
      state.error = null
    })
})

export default pushReducer

// ------------------------------------
// Helpers
// ------------------------------------
function urlBase64ToUint8Array (base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}
