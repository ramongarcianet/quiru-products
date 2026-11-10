export default Object.freeze({
  products: Object.freeze(['AGENDA', 'DENT']),
  channels: Object.freeze(['PUSH', 'EMAIL', 'WHATSAPP', 'SMS']),
  types: Object.freeze([
    'APPOINTMENT_CREATED',
    'APPOINTMENT_UPDATED',
    'APPOINTMENT_CANCELLED',
    'APPOINTMENT_REMINDER'
  ]),
  statuses: Object.freeze(['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED']),
  defaultReminderOffsetsMinutes: Object.freeze([1440, 120, 30]),
  maxAttempts: 3,
  batchSize: 100,
  retentionDays: 30
})
