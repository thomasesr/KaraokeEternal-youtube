/* global clients */

// Derive API base from the SW's own URL: 'http://host/ke/sw.js' → 'http://host/ke/'
const apiBase = self.location.href.replace(/\/sw\.js$/, '/')

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
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
    }).catch((e) => {
      console.error('[sw] showNotification error:', e)
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'play-now') {
    const url = `${apiBase}api/singer-play`
    event.waitUntil(
      fetch(url, {
        method: 'POST',
        credentials: 'include',
      }).catch((e) => {
        console.error('[sw] singer-play fetch error:', e)
      })
    )
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow('.')
    })
  )
})
