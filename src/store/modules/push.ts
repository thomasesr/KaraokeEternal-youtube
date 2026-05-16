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
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        dispatch(subscribeFail('Push notifications not supported in this browser'))
        return
      }

      if ('Notification' in window) {
        if (Notification.permission === 'denied') {
          return
        }
        if (Notification.permission === 'default') {
          const perm = await Notification.requestPermission()
          if (perm !== 'granted') return
        }
      }

      const swUrl = new URL('sw.js', document.baseURI).href
      const registration = await navigator.serviceWorker.register(swUrl, {
        scope: new URL('.', document.baseURI).href,
      })

      await navigator.serviceWorker.ready

      const existing = await registration.pushManager.getSubscription()
      if (existing) {
        dispatch(subscribeSuccess())
        return
      }

      const base = document.baseURI
      const keyRes = await fetch(`${base}api/push/vapid-public-key`, { credentials: 'include' })
      if (!keyRes.ok) throw new Error(`Failed to get VAPID public key: ${keyRes.status}`)
      const { publicKey } = await keyRes.json()

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      const res = await fetch(`${base}api/push/subscribe`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      if (!res.ok) throw new Error(`Failed to save push subscription: ${res.status}`)

      dispatch(subscribeSuccess())
    } catch (err) {
      dispatch(subscribeFail(err instanceof Error ? err.message : 'Unknown error'))
    }
  }
}

export function unsubscribePush (): AppThunk {
  return async (dispatch) => {
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) {
        dispatch(unsubscribeSuccess())
        return
      }

      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        dispatch(unsubscribeSuccess())
        return
      }

      await fetch(`${document.baseURI}api/push/unsubscribe`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })

      await subscription.unsubscribe()
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
