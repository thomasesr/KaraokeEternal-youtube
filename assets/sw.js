/* global clients */

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
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
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'play-now') {
    event.waitUntil(
      fetch('api/singer-play', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {})
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
