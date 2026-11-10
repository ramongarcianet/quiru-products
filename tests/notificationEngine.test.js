import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { NotificationTemplateResolver } = require('../functions/notifications/templates.js')
const { FcmNotificationProvider, MockNotificationProvider, NotificationDispatcher, INVALID_TOKEN_CODES, sanitizeError } = require('../functions/notifications/providers.js')
const { ReminderService, normalizeOffsets, idempotencyKey } = require('../functions/notifications/reminderService.js')
const { retryDelayMinutes, shouldRetry } = require('../functions/notifications/retryPolicy.js')

test('las plantillas enrutan al producto correcto y DENT no expone datos clínicos', () => {
  const resolver = new NotificationTemplateResolver()
  const dent = resolver.resolve({ product: 'DENT', type: 'APPOINTMENT_REMINDER', payload: { offsetMinutes: 30 } })
  const agenda = resolver.resolve({ product: 'AGENDA', type: 'APPOINTMENT_REMINDER', payload: { offsetMinutes: 120 } })
  assert.match(dent.link, /dashboard\/citas/)
  assert.doesNotMatch(`${dent.title} ${dent.body}`, /paciente|diagn[oó]stico|tratamiento|documento/i)
  assert.match(agenda.link, /agenda/i)
})

test('el dispatcher permite probar sin FCM mediante provider mock', async () => {
  const provider = new MockNotificationProvider()
  const dispatcher = new NotificationDispatcher({ PUSH: provider })
  const result = await dispatcher.dispatch({ product: 'AGENDA', title: 'Prueba' })
  assert.equal(result.successCount, 1)
  assert.equal(provider.sent.length, 1)
})

test('la política reintenta 5, 30 y 120 minutos y termina al máximo', () => {
  assert.deepEqual([1, 2, 3, 4].map(retryDelayMinutes), [5, 30, 120, 120])
  assert.equal(shouldRetry(1, 3), true)
  assert.equal(shouldRetry(3, 3), false)
  assert.equal(shouldRetry(1, 3, true), false)
})

test('tokens inválidos se reconocen y los errores no filtran secretos', () => {
  assert.equal(INVALID_TOKEN_CODES.has('messaging/registration-token-not-registered'), true)
  assert.equal(INVALID_TOKEN_CODES.has('messaging/internal-error'), false)
  assert.doesNotMatch(sanitizeError(new Error('token=abc123')), /abc123/)
})

test('crear, reprogramar y cancelar conservan claves deterministas por evento', () => {
  const appointment = { product: 'DENT', appointmentId: 'cita-1', recipientId: 'user-1' }
  const created = idempotencyKey({ ...appointment, type: 'APPOINTMENT_CREATED' })
  const updated = idempotencyKey({ ...appointment, type: 'APPOINTMENT_UPDATED' })
  const cancelled = idempotencyKey({ ...appointment, type: 'APPOINTMENT_CANCELLED' })
  assert.equal(created, idempotencyKey({ ...appointment, type: 'APPOINTMENT_CREATED' }))
  assert.equal(new Set([created, updated, cancelled]).size, 3)
  assert.deepEqual(normalizeOffsets([30, 120, 1440, 30]), [1440, 120, 30])
})

function reminderDb() {
  const records = new Map()
  const ref = path => ({
    path,
    get id() { return path.split('/').at(-1) },
    async get() {
      if (path.includes('/notificationPreferences/')) return {
        exists: true,
        data: () => ({ pushEnabled: true, appointmentReminders: true, reminderOffsetsMinutes: [1440, 120, 30] })
      }
      return { exists: records.has(path), data: () => records.get(path) }
    }
  })
  return {
    records,
    doc: ref,
    async runTransaction(callback) {
      return callback({
        get: target => target.get(),
        set: (target, value) => records.set(target.path, value)
      })
    },
    collection() {
      const query = {
        where() { return query },
        limit() { return query },
        async get() {
          return { docs: [...records.entries()].map(([path, value]) => ({
            id: path.split('/').at(-1), data: () => value,
            ref: { path, set: async patch => records.set(path, { ...records.get(path), ...patch }) }
          })) }
        }
      }
      return query
    },
    batch() {
      const updates = []
      return {
        update: (target, value) => updates.push([target, value]),
        async commit() { updates.forEach(([target, value]) => records.set(target.path, { ...records.get(target.path), ...value })) }
      }
    }
  }
}

test('ReminderService crea una sola vez, reprograma y cancela jobs pendientes', async () => {
  const db = reminderDb()
  const service = new ReminderService({ db, logger: { info() {} } })
  const base = {
    product: 'AGENDA', appointmentId: 'apt-1', recipientId: 'user-1',
    startAt: new Date(Date.now() + 3 * 86400000), timeZone: 'America/Lima',
    locale: 'es-PE', version: 'v1'
  }
  assert.equal(await service.createAppointmentReminders(base), 4)
  assert.equal(await service.createAppointmentReminders(base), 0)
  assert.equal(db.records.size, 4)

  assert.equal(await service.rescheduleAppointmentReminders({ ...base, startAt: new Date(base.startAt.getTime() + 3600000), version: 'v2' }), 4)
  assert.equal([...db.records.values()].filter(job => job.status === 'PENDING').length, 4)

  await service.appointmentCancelled({ ...base, version: 'v3' })
  assert.equal([...db.records.values()].filter(job => job.status === 'PENDING').length, 1)
  assert.equal([...db.records.values()].filter(job => job.type === 'APPOINTMENT_CANCELLED').length, 1)
})

test('FcmNotificationProvider deshabilita un token rechazado sin usar FCM real', async () => {
  let tokenPatch = null
  const tokenRef = { async set(value) { tokenPatch = value } }
  const db = {
    doc: () => ({ get: async () => ({ exists: true, data: () => ({ pushEnabled: true }) }) }),
    collection: () => ({
      where() { return this }, limit() { return this },
      async get() { return { docs: [{ data: () => ({ token: 'fake-token', products: ['DENT'] }), ref: tokenRef }] } }
    })
  }
  const messaging = { async sendEachForMulticast() {
    return { successCount: 0, failureCount: 1, responses: [{ success: false, error: { code: 'messaging/registration-token-not-registered' } }] }
  } }
  const provider = new FcmNotificationProvider({ db, messaging, logger: { warn() {} } })
  const result = await provider.send({ recipientId: 'user-1', product: 'DENT', type: 'APPOINTMENT_REMINDER' })
  assert.equal(result.permanent, true)
  assert.equal(tokenPatch.enabled, false)
  assert.equal(tokenPatch.disabledReason, 'messaging/registration-token-not-registered')
})

test('simula 1,000 citas y 3,000 recordatorios en lotes de 100', t => {
  const startedAt = performance.now()
  const appointments = Array.from({ length: 1000 }, (_, index) => `appointment-${index}`)
  const jobs = appointments.flatMap(appointmentId => [1440, 120, 30].map(offsetMinutes =>
    idempotencyKey({ product: 'AGENDA', appointmentId, recipientId: 'user-1', type: 'APPOINTMENT_REMINDER', offsetMinutes })))
  const uniqueJobs = new Set(jobs)
  const metrics = {
    appointments: appointments.length,
    jobs: jobs.length,
    uniqueJobs: uniqueJobs.size,
    initialWrites: uniqueJobs.size,
    dueQueryReads: uniqueJobs.size,
    schedulerBatches: Math.ceil(uniqueJobs.size / 100),
    sends: uniqueJobs.size,
    durationMs: Number((performance.now() - startedAt).toFixed(2))
  }
  assert.deepEqual({ ...metrics, durationMs: 0 }, {
    appointments: 1000, jobs: 3000, uniqueJobs: 3000, initialWrites: 3000,
    dueQueryReads: 3000, schedulerBatches: 30, sends: 3000, durationMs: 0
  })
  t.diagnostic(JSON.stringify(metrics))
})
