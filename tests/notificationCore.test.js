import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  defaultNotificationPreferences,
  normalizeReminderOffsets,
  notificationContract,
  notificationIdempotencyKey,
  reminderScheduledAt
} from '../packages/notification-core/src/index.js'

test('el contrato frontend coincide con el contrato JSON del backend', async () => {
  const backendContract = JSON.parse(await readFile(
    new URL('../packages/notification-core/notification-contract.json', import.meta.url), 'utf8'))
  const deployedFunctionsContract = JSON.parse(await readFile(
    new URL('../functions/notifications/notification-contract.json', import.meta.url), 'utf8'))
  assert.deepEqual(JSON.parse(JSON.stringify(notificationContract)), backendContract)
  assert.deepEqual(deployedFunctionsContract, backendContract)
})

test('normaliza offsets y calcula 24h, 2h y 30m antes', () => {
  assert.deepEqual(normalizeReminderOffsets([30, 1440, 120, 30, -1, 'x']), [1440, 120, 30])
  const start = new Date('2026-11-12T15:00:00.000Z')
  assert.equal(reminderScheduledAt(start, 1440).toISOString(), '2026-11-11T15:00:00.000Z')
  assert.equal(reminderScheduledAt(start, 120).toISOString(), '2026-11-12T13:00:00.000Z')
  assert.equal(reminderScheduledAt(start, 30).toISOString(), '2026-11-12T14:30:00.000Z')
})

test('la clave idempotente es estable y separa productos y offsets', () => {
  const base = { product: 'AGENDA', appointmentId: 'a/1', recipientId: 'u1', type: 'APPOINTMENT_REMINDER' }
  assert.equal(notificationIdempotencyKey({ ...base, offsetMinutes: 30 }), notificationIdempotencyKey({ ...base, offsetMinutes: 30 }))
  assert.notEqual(notificationIdempotencyKey({ ...base, offsetMinutes: 30 }), notificationIdempotencyKey({ ...base, offsetMinutes: 120 }))
  assert.notEqual(notificationIdempotencyKey({ ...base, offsetMinutes: 30 }), notificationIdempotencyKey({ ...base, product: 'DENT', offsetMinutes: 30 }))
})

test('push inicia deshabilitado y los recordatorios con valores seguros', () => {
  assert.deepEqual(defaultNotificationPreferences('DENT'), {
    product: 'DENT', pushEnabled: false, appointmentReminders: true,
    reminderOffsetsMinutes: [1440, 120, 30]
  })
  assert.throws(() => defaultNotificationPreferences('OTRO'))
})
