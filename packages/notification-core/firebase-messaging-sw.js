/* global firebase */
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyCmuv9CEw64vyP6RMNBje3X-feEsbdg4Lw',
  authDomain: 'quiru-prod.firebaseapp.com',
  projectId: 'quiru-prod',
  storageBucket: 'quiru-prod.appspot.com',
  messagingSenderId: '605281793847',
  appId: '1:605281793847:web:7635e785fb4472e24b0cb2'
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage(payload => {
  const data = payload?.data || {}
  const title = data.title || 'QUIRU'
  return self.registration.showNotification(title, {
    body: data.body || 'Tienes una nueva notificación.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.idempotencyKey || data.jobId || 'quiru-notification',
    renotify: false,
    data: { link: data.link || '/', product: data.product || '' }
  })
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.link || '/', self.location.origin).href
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const existing = windows.find(client => client.url.startsWith(new URL(target).origin))
    if (existing) {
      existing.navigate(target)
      return existing.focus()
    }
    return clients.openWindow(target)
  }))
})
