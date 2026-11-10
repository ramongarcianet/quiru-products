const { createHash } = require('node:crypto')
const { getMessaging } = require('firebase-admin/messaging')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { HttpsError, onCall } = require('firebase-functions/v2/https')
const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const logger = require('firebase-functions/logger')
const config = require('./config')
const { NotificationTemplateResolver } = require('./templates')
const { FcmNotificationProvider, NotificationDispatcher, sanitizeError } = require('./providers')
const { ReminderService, normalizeOffsets } = require('./reminderService')
const { retryDelayMinutes, shouldRetry } = require('./retryPolicy')

module.exports = function createNotificationFunctions(db) {
  const reminderService = new ReminderService({ db, logger })
  const templateResolver = new NotificationTemplateResolver()
  const dispatcher = new NotificationDispatcher({
    PUSH: new FcmNotificationProvider({ db, messaging: getMessaging(), logger })
  })

  async function assertProductAccess(request, product) {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
    if (!Object.values(config.products).includes(product)) throw new HttpsError('invalid-argument', 'Producto no válido.')
    const profileSnapshot = await db.doc(`usuario/${request.auth.uid}`).get()
    if (!profileSnapshot.exists) throw new HttpsError('permission-denied', 'Tu perfil no existe.')
    const profile = profileSnapshot.data()
    let access = profile
    if (profile.activeOrganizationId) {
      const membership = await db.doc(`organizations/${profile.activeOrganizationId}/members/${request.auth.uid}`).get()
      if (membership.exists) access = { ...profile, ...membership.data() }
    }
    const moduleId = product === config.products.AGENDA ? 'smart-agenda' : 'dentistry'
    const modules = access.modules
    const explicitlyEnabled = modules?.[moduleId] === true || modules?.[moduleId]?.enabled === true
    const legacyDentAccess = product === config.products.DENT && (!modules || typeof modules !== 'object')
    if (!explicitlyEnabled && !legacyDentAccess) throw new HttpsError('permission-denied', 'No tienes acceso a este producto.')
    return { uid: request.auth.uid, profile, access }
  }

  const getNotificationPreferences = onCall({ enforceAppCheck: true }, async request => {
    const product = String(request.data?.product || '').toUpperCase()
    const access = await assertProductAccess(request, product)
    const snapshot = await db.doc(`usuario/${access.uid}/notificationPreferences/${product}`).get()
    const data = snapshot.exists ? snapshot.data() : {}
    return {
      product,
      pushEnabled: data.pushEnabled === true,
      appointmentReminders: data.appointmentReminders !== false,
      reminderOffsetsMinutes: normalizeOffsets(data.reminderOffsetsMinutes)
    }
  })

  const saveNotificationPreferences = onCall({ enforceAppCheck: true }, async request => {
    const product = String(request.data?.product || '').toUpperCase()
    const access = await assertProductAccess(request, product)
    const preferences = {
      product,
      pushEnabled: request.data?.pushEnabled === true,
      appointmentReminders: request.data?.appointmentReminders !== false,
      reminderOffsetsMinutes: normalizeOffsets(request.data?.reminderOffsetsMinutes),
      updatedAt: FieldValue.serverTimestamp()
    }
    await db.doc(`usuario/${access.uid}/notificationPreferences/${product}`).set(preferences, { merge: true })
    return { ...preferences, updatedAt: undefined }
  })

  const registerNotificationToken = onCall({ enforceAppCheck: true }, async request => {
    const product = String(request.data?.product || '').toUpperCase()
    const access = await assertProductAccess(request, product)
    const token = String(request.data?.token || '').trim()
    if (token.length < 40 || token.length > 4096) throw new HttpsError('invalid-argument', 'Token FCM inválido.')
    const tokenId = createHash('sha256').update(token).digest('hex')
    const reference = db.doc(`usuario/${access.uid}/notificationTokens/${tokenId}`)
    const preferencesReference = db.doc(`usuario/${access.uid}/notificationPreferences/${product}`)
    const preferencesSnapshot = await preferencesReference.get()
    await reference.set({
      token,
      platform: 'web',
      enabled: true,
      products: FieldValue.arrayUnion(product),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true })
    await preferencesReference.set(preferencesSnapshot.exists
      ? { product, pushEnabled: true, updatedAt: FieldValue.serverTimestamp() }
      : {
          product, pushEnabled: true, appointmentReminders: true,
          reminderOffsetsMinutes: config.defaultReminderOffsetsMinutes,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true })
    return { registered: true, tokenId }
  })

  const sendTestNotification = onCall({ enforceAppCheck: true }, async request => {
    const product = String(request.data?.product || '').toUpperCase()
    const access = await assertProductAccess(request, product)
    const template = templateResolver.test(product)
    const result = await dispatcher.dispatch({
      ...template, recipientId: access.uid, product, type: 'TEST',
      jobId: `test-${Date.now()}`, idempotencyKey: `TEST_${product}_${access.uid}_${Date.now()}`
    })
    if (!result.successCount) throw new HttpsError('failed-precondition', 'No hay dispositivos activos para recibir la prueba.')
    return { sent: result.successCount }
  })

  function agendaAppointment(snapshot, appointmentId) {
    if (!snapshot?.exists) return null
    const data = snapshot.data()
    const startAt = data.startAt?.toDate?.()
    if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime()) || !data.createdBy) return null
    return {
      product: config.products.AGENDA, appointmentId, recipientId: data.createdBy,
      startAt, timeZone: data.timeZone || 'America/Lima', locale: data.locale || 'es-PE',
      status: data.status || 'confirmed', version: `${startAt.getTime()}:${data.status || 'confirmed'}`
    }
  }

  function dentAppointment(snapshot, appointmentId) {
    if (!snapshot?.exists) return null
    const data = snapshot.data()
    const startAt = new Date(data.start)
    if (Number.isNaN(startAt.getTime()) || !data.UserId) return null
    const status = data.estado === false ? 'cancelled' : 'confirmed'
    return {
      product: config.products.DENT, appointmentId, recipientId: data.UserId,
      startAt, timeZone: data.timeZone || 'America/Lima', locale: 'es-PE', status,
      version: `${startAt.getTime()}:${status}`
    }
  }

  async function synchronizeAppointment(before, after) {
    if (!before && !after) return
    const current = after || before
    if (!before && after) {
      if (after.status === 'cancelled') return reminderService.appointmentCancelled(after)
      return reminderService.createAppointmentReminders(after)
    }
    if (!after) return reminderService.appointmentCancelled({ ...before, version: `${before.version}:deleted` })
    if (after.status === 'cancelled' && before.status !== 'cancelled') return reminderService.appointmentCancelled(after)
    if (['completed', 'no_show'].includes(after.status) && before.status !== after.status) {
      return reminderService.cancelAppointmentReminders(after.product, after.appointmentId)
    }
    if (before.startAt.getTime() !== after.startAt.getTime()) return reminderService.rescheduleAppointmentReminders(after)
  }

  const syncAgendaAppointmentNotifications = onDocumentWritten(
    'businesses/{businessId}/appointments/{appointmentId}',
    event => synchronizeAppointment(
      agendaAppointment(event.data?.before, event.params.appointmentId),
      agendaAppointment(event.data?.after, event.params.appointmentId)
    )
  )

  const syncDentAppointmentNotifications = onDocumentWritten(
    'citas/{appointmentId}',
    event => synchronizeAppointment(
      dentAppointment(event.data?.before, event.params.appointmentId),
      dentAppointment(event.data?.after, event.params.appointmentId)
    )
  )

  async function recoverExpiredLocks(now) {
    const snapshot = await db.collection('notificationJobs')
      .where('status', '==', config.statuses.PROCESSING)
      .where('leaseExpiresAt', '<=', now)
      .limit(config.batchSize).get()
    if (snapshot.empty) return
    const batch = db.batch()
    snapshot.docs.forEach(item => batch.update(item.ref, {
      status: config.statuses.PENDING, processAt: now, leaseExpiresAt: null,
      updatedAt: FieldValue.serverTimestamp(), lastError: 'processing-lock-expired'
    }))
    await batch.commit()
  }

  async function claimJob(reference, now) {
    return db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference)
      if (!snapshot.exists) return null
      const job = snapshot.data()
      if (job.status !== config.statuses.PENDING || job.processAt?.toMillis?.() > now.toMillis()) return null
      const attempts = Number(job.attempts || 0) + 1
      transaction.update(reference, {
        status: config.statuses.PROCESSING,
        attempts,
        leaseExpiresAt: Timestamp.fromMillis(now.toMillis() + config.lockMinutes * 60000),
        updatedAt: FieldValue.serverTimestamp()
      })
      return { ...job, id: snapshot.id, attempts }
    })
  }

  const terminalUpdate = (status, extra = {}) => ({
    status, leaseExpiresAt: null, updatedAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + config.retentionDays * 86400000), ...extra
  })

  async function processJob(reference, now) {
    const job = await claimJob(reference, now)
    if (!job) return
    logger.info('notification_processing', { product: job.product, type: job.type })
    try {
      const template = templateResolver.resolve(job)
      const result = await dispatcher.dispatch({
        ...template, recipientId: job.recipientId, product: job.product, type: job.type,
        jobId: job.id, idempotencyKey: job.idempotencyKey
      })
      if (result.successCount > 0) {
        await reference.update(terminalUpdate(config.statuses.SENT, {
          sentAt: FieldValue.serverTimestamp(), lastError: '', deliveryCount: result.successCount
        }))
        logger.info('notification_sent', { product: job.product, type: job.type })
        return
      }
      if (!shouldRetry(job.attempts, config.maxAttempts, result.permanent)) {
        await reference.update(terminalUpdate(config.statuses.FAILED, { lastError: result.error || 'delivery-failed' }))
        logger.error('notification_failed', { product: job.product, type: job.type, permanent: Boolean(result.permanent) })
        return
      }
      const delayMinutes = retryDelayMinutes(job.attempts)
      const retryAt = Timestamp.fromMillis(Date.now() + delayMinutes * 60000)
      await reference.update({
        status: config.statuses.PENDING, processAt: retryAt, nextAttemptAt: retryAt,
        leaseExpiresAt: null, lastError: result.error || 'temporary-delivery-error', updatedAt: FieldValue.serverTimestamp()
      })
    } catch (error) {
      const lastError = sanitizeError(error)
      if (!shouldRetry(job.attempts, config.maxAttempts)) {
        await reference.update(terminalUpdate(config.statuses.FAILED, { lastError }))
      } else {
        const retryAt = Timestamp.fromMillis(Date.now() + retryDelayMinutes(job.attempts) * 60000)
        await reference.update({ status: config.statuses.PENDING, processAt: retryAt, nextAttemptAt: retryAt, leaseExpiresAt: null, lastError, updatedAt: FieldValue.serverTimestamp() })
      }
      logger.error('notification_failed', { product: job.product, type: job.type })
    }
  }

  const processNotificationJobs = onSchedule({ schedule: config.schedule, timeZone: 'UTC' }, async () => {
    const now = Timestamp.now()
    await recoverExpiredLocks(now)
    const snapshot = await db.collection('notificationJobs')
      .where('status', '==', config.statuses.PENDING)
      .where('processAt', '<=', now)
      .orderBy('processAt', 'asc')
      .limit(config.batchSize).get()
    await Promise.all(snapshot.docs.map(item => processJob(item.ref, now)))
  })

  return {
    getNotificationPreferences,
    saveNotificationPreferences,
    registerNotificationToken,
    sendTestNotification,
    syncAgendaAppointmentNotifications,
    syncDentAppointmentNotifications,
    processNotificationJobs
  }
}
