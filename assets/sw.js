/* global clients */

// Derive API base from the SW's own URL: 'http://host/ke/sw.js' → 'http://host/ke/'
const apiBase = self.location.href.replace(/\/sw\.js$/, '/')
console.log('[sw] loaded, apiBase =', apiBase)

self.addEventListener('install', (event) => {
  console.log('[sw] install event')
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('[sw] activate event')
  event.waitUntil(clients.claim())
})

self.addEventListener('push', (event) => {
  console.log('[sw] push event received, has data:', !!event.data)
  if (!event.data) return

  let data
  try {
    data = event.data.json()
    console.log('[sw] push payload:', data)
  } catch (e) {
    console.error('[sw] push payload parse error:', e)
    return
  }

  const { title, body, actions = [] } = data

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: 'assets/favicon.ico',
      badge: 'assets/favicon.ico',
      actions,
      tag: 'singer-turn',
      requireInteraction: true,
    }).then(() => {
      console.log('[sw] notification shown:', title)
    }).catch((e) => {
      console.error('[sw] showNotification error:', e)
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  console.log('[sw] notificationclick, action:', event.action)
  event.notification.close()

  if (event.action === 'play-now') {
    const url = `${apiBase}api/singer-play`
    console.log('[sw] posting singer-play to', url)
    event.waitUntil(
      fetch(url, {
        method: 'POST',
        credentials: 'include',
      }).then((res) => {
        console.log('[sw] singer-play response:', res.status)
      }).catch((e) => {
        console.error('[sw] singer-play fetch error:', e)
      })
    )
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      console.log('[sw] open windows:', windowClients.length)
      for (const client of windowClients) {
        if ('focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow('.')
    })
  )
})
