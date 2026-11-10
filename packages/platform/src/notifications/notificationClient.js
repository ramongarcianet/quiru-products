import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'
import { httpsCallable } from 'firebase/functions'
import { app, functions } from '../firebase.js'

const listeners = new Set()
let foregroundUnsubscribe = null
let messagingPromise = null

const callable = name => httpsCallable(functions, name)
const messagingInstance = async () => {
  if (!messagingPromise) messagingPromise = isSupported().then(supported => supported ? getMessaging(app) : null)
  return messagingPromise
}

export const browserNotificationState = () => {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported'
  return Notification.permission
}

export async function activatePushNotifications(product) {
  if (browserNotificationState() === 'unsupported') throw new Error('Este navegador no admite notificaciones push.')
  const vapidKey = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim()
  if (!vapidKey) throw new Error('Falta configurar VITE_FIREBASE_VAPID_KEY.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied'
    ? 'Las notificaciones están bloqueadas en tu navegador.'
    : 'No se concedió permiso para notificaciones.')
  const messaging = await messagingInstance()
  if (!messaging) throw new Error('Firebase Messaging no está disponible en este navegador.')
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })
  if (!token) throw new Error('Firebase no devolvió un token de notificaciones.')
  await callable('registerNotificationToken')({ product, token, platform: 'web' })
  await startForegroundNotifications()
  return token
}

export async function loadNotificationPreferences(product) {
  return (await callable('getNotificationPreferences')({ product })).data
}

export async function saveNotificationPreferences(preferences) {
  return (await callable('saveNotificationPreferences')(preferences)).data
}

export async function sendTestNotification(product) {
  return (await callable('sendTestNotification')({ product })).data
}

export async function startForegroundNotifications() {
  if (foregroundUnsubscribe || browserNotificationState() !== 'granted') return
  const messaging = await messagingInstance()
  if (!messaging) return
  foregroundUnsubscribe = onMessage(messaging, payload => {
    const data = payload?.data || {}
    listeners.forEach(listener => listener({
      title: data.title || 'QUIRU',
      body: data.body || 'Tienes una nueva notificación.',
      link: data.link || '/',
      product: data.product || ''
    }))
  })
}

export function subscribeForegroundNotifications(listener) {
  listeners.add(listener)
  startForegroundNotifications().catch(() => {})
  return () => listeners.delete(listener)
}
