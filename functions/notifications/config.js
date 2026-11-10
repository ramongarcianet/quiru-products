const contract = require('./notification-contract.json')

const numberFromEnv = (name, fallback, minimum, maximum) => {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback
}

module.exports = Object.freeze({
  products: Object.freeze({ AGENDA: 'AGENDA', DENT: 'DENT' }),
  channels: Object.freeze({ PUSH: 'PUSH', EMAIL: 'EMAIL', WHATSAPP: 'WHATSAPP', SMS: 'SMS' }),
  types: Object.freeze({
    APPOINTMENT_CREATED: 'APPOINTMENT_CREATED',
    APPOINTMENT_UPDATED: 'APPOINTMENT_UPDATED',
    APPOINTMENT_CANCELLED: 'APPOINTMENT_CANCELLED',
    APPOINTMENT_REMINDER: 'APPOINTMENT_REMINDER'
  }),
  statuses: Object.freeze({ PENDING: 'PENDING', PROCESSING: 'PROCESSING', SENT: 'SENT', FAILED: 'FAILED', CANCELLED: 'CANCELLED' }),
  defaultReminderOffsetsMinutes: Object.freeze([...contract.defaultReminderOffsetsMinutes]),
  batchSize: numberFromEnv('NOTIFICATION_BATCH_SIZE', contract.batchSize, 1, 500),
  maxAttempts: numberFromEnv('NOTIFICATION_MAX_ATTEMPTS', contract.maxAttempts, 1, 10),
  retentionDays: numberFromEnv('NOTIFICATION_RETENTION_DAYS', contract.retentionDays, 1, 365),
  lockMinutes: numberFromEnv('NOTIFICATION_LOCK_MINUTES', 10, 1, 60),
  schedule: process.env.NOTIFICATION_SCHEDULE || 'every 5 minutes',
  agendaUrl: process.env.QUIRU_AGENDA_URL || 'https://quiru-agenda.web.app',
  dentUrl: process.env.QUIRU_DENT_URL || 'https://quiru-odontologia.web.app'
})
