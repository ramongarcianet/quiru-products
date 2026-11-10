import contract from './notificationContract.js'

export const QUIRU_PRODUCTS = Object.freeze({ AGENDA: 'AGENDA', DENT: 'DENT' })
export const NOTIFICATION_CHANNELS = Object.freeze({ PUSH: 'PUSH', EMAIL: 'EMAIL', WHATSAPP: 'WHATSAPP', SMS: 'SMS' })
export const NOTIFICATION_TYPES = Object.freeze({
  APPOINTMENT_CREATED: 'APPOINTMENT_CREATED',
  APPOINTMENT_UPDATED: 'APPOINTMENT_UPDATED',
  APPOINTMENT_CANCELLED: 'APPOINTMENT_CANCELLED',
  APPOINTMENT_REMINDER: 'APPOINTMENT_REMINDER'
})
export const DEFAULT_REMINDER_OFFSETS_MINUTES = Object.freeze([...contract.defaultReminderOffsetsMinutes])

export function normalizeReminderOffsets(values = DEFAULT_REMINDER_OFFSETS_MINUTES) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter(value => Number.isInteger(value) && value > 0 && value <= 60 * 24 * 30))]
    .sort((left, right) => right - left)
}

export function reminderScheduledAt(startAt, offsetMinutes) {
  const start = startAt instanceof Date ? startAt : new Date(startAt)
  const offset = Number(offsetMinutes)
  if (Number.isNaN(start.getTime()) || !Number.isInteger(offset) || offset <= 0) {
    throw new Error('La fecha de la cita y el offset deben ser válidos.')
  }
  return new Date(start.getTime() - offset * 60000)
}

export function notificationIdempotencyKey({ product, appointmentId, recipientId, type, offsetMinutes = 0 }) {
  return [product, appointmentId, recipientId, type, Number(offsetMinutes || 0)]
    .map(value => String(value || '').trim().replace(/[^a-zA-Z0-9-]/g, '-'))
    .join('_')
}

export function defaultNotificationPreferences(product) {
  if (!contract.products.includes(product)) throw new Error('Producto de notificación no soportado.')
  return {
    product,
    pushEnabled: false,
    appointmentReminders: true,
    reminderOffsetsMinutes: [...DEFAULT_REMINDER_OFFSETS_MINUTES]
  }
}

export { contract as notificationContract }
