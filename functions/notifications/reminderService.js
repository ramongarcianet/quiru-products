const { createHash } = require('node:crypto')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const config = require('./config')

const normalizeOffsets = values => [...new Set((Array.isArray(values) ? values : config.defaultReminderOffsetsMinutes)
  .map(Number).filter(value => Number.isInteger(value) && value > 0 && value <= 43200))].sort((a, b) => b - a)
const idempotencyKey = ({ product, appointmentId, recipientId, type, offsetMinutes = 0 }) =>
  [product, appointmentId, recipientId, type, Number(offsetMinutes || 0)]
    .map(value => String(value || '').trim().replace(/[^a-zA-Z0-9-]/g, '-')).join('_')
const jobId = key => createHash('sha256').update(key).digest('hex').slice(0, 48)
const timestamp = value => value instanceof Timestamp ? value : Timestamp.fromDate(value instanceof Date ? value : new Date(value))

class ReminderService {
  constructor({ db, logger = console }) { this.db = db; this.logger = logger }

  async preferences(recipientId, product) {
    const snapshot = await this.db.doc(`usuario/${recipientId}/notificationPreferences/${product}`).get()
    const data = snapshot.exists ? snapshot.data() : {}
    return {
      product,
      pushEnabled: data.pushEnabled === true,
      appointmentReminders: data.appointmentReminders !== false,
      reminderOffsetsMinutes: normalizeOffsets(data.reminderOffsetsMinutes)
    }
  }

  buildJob(appointment, type, scheduledAt, offsetMinutes = 0) {
    const key = idempotencyKey({ ...appointment, type, offsetMinutes })
    const when = timestamp(scheduledAt)
    return {
      id: jobId(key), product: appointment.product, type, recipientId: appointment.recipientId,
      scheduledAt: when, processAt: when, status: config.statuses.PENDING,
      channels: [config.channels.PUSH], reference: { type: 'APPOINTMENT', id: appointment.appointmentId },
      referenceKey: `${appointment.product}:${appointment.appointmentId}`,
      templateId: `${appointment.product}_${type}`, payload: {
        offsetMinutes, locale: appointment.locale || 'es-PE', timeZone: appointment.timeZone || 'America/Lima'
      },
      idempotencyKey: key, appointmentVersion: appointment.version,
      attempts: 0, nextAttemptAt: null, lastError: '', leaseExpiresAt: null,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    }
  }

  async writeIdempotent(jobs) {
    if (!jobs.length) return 0
    let written = 0
    await this.db.runTransaction(async transaction => {
      const refs = jobs.map(job => this.db.doc(`notificationJobs/${job.id}`))
      const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)))
      jobs.forEach((job, index) => {
        const existing = snapshots[index]
        if (existing.exists && existing.data().appointmentVersion === job.appointmentVersion) return
        transaction.set(refs[index], job)
        written += 1
      })
    })
    if (written) this.logger.info('notification_job_created', { count: written, product: jobs[0].product })
    return written
  }

  async cancelAppointmentReminders(product, appointmentId) {
    const snapshot = await this.db.collection('notificationJobs')
      .where('referenceKey', '==', `${product}:${appointmentId}`).limit(100).get()
    const cancellable = snapshot.docs.filter(item => [config.statuses.PENDING, config.statuses.PROCESSING].includes(item.data().status))
    if (!cancellable.length) return 0
    const batch = this.db.batch()
    const expiresAt = Timestamp.fromMillis(Date.now() + config.retentionDays * 86400000)
    cancellable.forEach(item => batch.update(item.ref, {
      status: config.statuses.CANCELLED, updatedAt: FieldValue.serverTimestamp(), expiresAt,
      leaseExpiresAt: null, lastError: ''
    }))
    await batch.commit()
    this.logger.info('notification_cancelled', { count: cancellable.length, product })
    return cancellable.length
  }

  async createAppointmentReminders(appointment, eventType = config.types.APPOINTMENT_CREATED) {
    const preferences = await this.preferences(appointment.recipientId, appointment.product)
    if (!preferences.pushEnabled) return 0
    const now = new Date()
    const jobs = [this.buildJob(appointment, eventType, now)]
    if (preferences.appointmentReminders) {
      preferences.reminderOffsetsMinutes.forEach(offset => {
        const scheduledAt = new Date(appointment.startAt.getTime() - offset * 60000)
        if (scheduledAt > now) jobs.push(this.buildJob(appointment, config.types.APPOINTMENT_REMINDER, scheduledAt, offset))
      })
    }
    return this.writeIdempotent(jobs)
  }

  async rescheduleAppointmentReminders(appointment) {
    await this.cancelAppointmentReminders(appointment.product, appointment.appointmentId)
    return this.createAppointmentReminders(appointment, config.types.APPOINTMENT_UPDATED)
  }

  async appointmentCancelled(appointment) {
    await this.cancelAppointmentReminders(appointment.product, appointment.appointmentId)
    const preferences = await this.preferences(appointment.recipientId, appointment.product)
    return preferences.pushEnabled
      ? this.writeIdempotent([this.buildJob(appointment, config.types.APPOINTMENT_CANCELLED, new Date())])
      : 0
  }
}

module.exports = { ReminderService, normalizeOffsets, idempotencyKey, jobId }
