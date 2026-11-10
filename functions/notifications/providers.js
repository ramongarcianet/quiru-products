const { FieldValue } = require('firebase-admin/firestore')

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument'
])

const sanitizeError = error => String(error?.code || error?.message || 'notification-delivery-error')
  .replace(/(?:token|key|secret)\s*[:=]\s*\S+/gi, '[redacted]')
  .slice(0, 300)

class FcmNotificationProvider {
  constructor({ db, messaging, logger = console }) {
    this.db = db
    this.messaging = messaging
    this.logger = logger
  }

  async send(notification) {
    const preferenceSnapshot = await this.db
      .doc(`usuario/${notification.recipientId}/notificationPreferences/${notification.product}`)
      .get()
    if (!preferenceSnapshot.exists || preferenceSnapshot.data().pushEnabled !== true) {
      return { successCount: 0, failureCount: 0, permanent: true, error: 'PUSH_DISABLED' }
    }
    const snapshot = await this.db.collection(`usuario/${notification.recipientId}/notificationTokens`)
      .where('enabled', '==', true).limit(20).get()
    const tokenDocs = snapshot.docs.filter(item => {
      const products = item.data().products || []
      return products.includes(notification.product)
    })
    if (!tokenDocs.length) return { successCount: 0, failureCount: 0, permanent: true, error: 'NO_ACTIVE_TOKENS' }

    const response = await this.messaging.sendEachForMulticast({
      tokens: tokenDocs.map(item => item.data().token),
      data: Object.fromEntries(Object.entries({
        title: notification.title,
        body: notification.body,
        link: notification.link,
        product: notification.product,
        type: notification.type,
        jobId: notification.jobId,
        idempotencyKey: notification.idempotencyKey
      }).map(([key, value]) => [key, String(value || '')])),
      webpush: { headers: { Urgency: notification.type === 'APPOINTMENT_REMINDER' ? 'high' : 'normal' } }
    })

    const invalidWrites = []
    let temporaryFailures = 0
    response.responses.forEach((result, index) => {
      if (result.success) return
      const code = result.error?.code || ''
      if (INVALID_TOKEN_CODES.has(code)) {
        invalidWrites.push(tokenDocs[index].ref.set({
          enabled: false,
          disabledReason: code,
          disabledAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true }))
        this.logger.warn('notification_token_invalid', { product: notification.product, type: notification.type })
      } else temporaryFailures += 1
    })
    await Promise.all(invalidWrites)
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      permanent: response.successCount === 0 && temporaryFailures === 0,
      error: response.successCount ? '' : sanitizeError(response.responses.find(item => !item.success)?.error)
    }
  }
}

class MockNotificationProvider {
  constructor(result = { successCount: 1, failureCount: 0, permanent: false, error: '' }) {
    this.result = result
    this.sent = []
  }
  async send(notification) { this.sent.push(notification); return this.result }
}

class NotificationDispatcher {
  constructor(providers) { this.providers = providers }
  async dispatch(notification) {
    const provider = this.providers.PUSH
    if (!provider) throw new Error('No existe un provider PUSH configurado.')
    return provider.send(notification)
  }
}

module.exports = { FcmNotificationProvider, MockNotificationProvider, NotificationDispatcher, INVALID_TOKEN_CODES, sanitizeError }
