export const APPOINTMENT_STATUSES = Object.freeze({
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No asistió'
})

export const activeAppointment = appointment =>
  !['cancelled', 'completed', 'no_show'].includes(appointment?.status)

export function normalizeWhatsAppNumber(value, defaultCountryCode = '51') {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  const countryCode = String(defaultCountryCode || '').replace(/\D/g, '')
  if (digits.length === 9 && countryCode) digits = `${countryCode}${digits}`
  return digits.length >= 10 && digits.length <= 15 ? digits : ''
}

function appointmentDate(value) {
  const date = value?.toDate?.() || new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function datePartsInTimeZone(value, timeZone = 'America/Lima') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value)
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]))
}

function birthdayParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { year, month, day }
    : null
}

function birthdayInYear(parts, year) {
  const lastDay = new Date(Date.UTC(year, parts.month, 0)).getUTCDate()
  return new Date(Date.UTC(year, parts.month - 1, Math.min(parts.day, lastDay), 12))
}

export function customersWithUpcomingBirthdays(
  customers = [],
  now = new Date(),
  leadDays = 15,
  timeZone = 'America/Lima'
) {
  const todayParts = datePartsInTimeZone(now, timeZone)
  const today = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day, 12))
  const dayMs = 24 * 60 * 60 * 1000

  return customers
    .filter(customer => customer?.active !== false)
    .map(customer => {
      const parts = birthdayParts(customer.birthday)
      if (!parts) return null
      let nextBirthday = birthdayInYear(parts, todayParts.year)
      if (nextBirthday < today) nextBirthday = birthdayInYear(parts, todayParts.year + 1)
      const daysUntilBirthday = Math.round((nextBirthday.getTime() - today.getTime()) / dayMs)
      return {
        customerId: customer.id || '',
        customerName: customer.name || 'Cliente',
        customerPhone: customer.phone || '',
        birthday: customer.birthday,
        nextBirthday,
        daysUntilBirthday
      }
    })
    .filter(Boolean)
    .filter(customer => customer.daysUntilBirthday >= 0 && customer.daysUntilBirthday <= leadDays)
    .sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday || a.customerName.localeCompare(b.customerName))
}

export function appointmentCountsForMonth(
  appointments = [],
  now = new Date(),
  timeZone = 'America/Lima'
) {
  const current = datePartsInTimeZone(now, timeZone)
  return appointments.reduce((counts, appointment) => {
    const startAt = appointmentDate(appointment?.startAt)
    if (!startAt) return counts
    const appointmentParts = datePartsInTimeZone(startAt, timeZone)
    if (appointmentParts.year !== current.year || appointmentParts.month !== current.month) return counts
    if (appointment.status === 'completed') counts.completed += 1
    if (appointment.status === 'cancelled') counts.cancelled += 1
    return counts
  }, { completed: 0, cancelled: 0 })
}

export function customersApproachingMonthlyFollowUp(
  appointments,
  customers = [],
  now = new Date(),
  leadDays = 7
) {
  const monthDays = 30
  const dayMs = 24 * 60 * 60 * 1000
  const latestByCustomer = new Map()

  for (const appointment of appointments || []) {
    if (appointment?.status !== 'completed') continue
    const attendedAt = appointmentDate(appointment.startAt)
    if (!attendedAt || attendedAt > now) continue
    const customerKey = appointment.customerId || String(appointment.customerName || '').trim().toLowerCase()
    if (!customerKey) continue
    const current = latestByCustomer.get(customerKey)
    if (!current || attendedAt > current.attendedAt) {
      latestByCustomer.set(customerKey, { appointment, attendedAt })
    }
  }

  const customerById = new Map(customers.map(customer => [customer.id, customer]))
  return [...latestByCustomer.values()]
    .map(({ appointment, attendedAt }) => {
      const elapsedDays = Math.floor((now.getTime() - attendedAt.getTime()) / dayMs)
      const customer = customerById.get(appointment.customerId)
      return {
        customerId: appointment.customerId || '',
        customerName: appointment.customerName || customer?.name || 'Cliente',
        customerPhone: appointment.customerPhone || customer?.phone || '',
        attendedAt,
        daysUntilMonth: monthDays - elapsedDays
      }
    })
    .filter(item => item.daysUntilMonth >= 0 && item.daysUntilMonth <= leadDays)
    .sort((a, b) => a.daysUntilMonth - b.daysUntilMonth || a.customerName.localeCompare(b.customerName))
}

export function localDateTime(date, time) {
  const value = new Date(`${date}T${time}:00`)
  if (!date || !time || Number.isNaN(value.getTime())) {
    throw new Error('Selecciona una fecha y una hora válidas.')
  }
  return value
}

export function appointmentEnd(start, durationMinutes) {
  const duration = Number(durationMinutes)
  if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
    throw new Error('La duración debe estar entre 15 y 480 minutos.')
  }
  return new Date(start.getTime() + duration * 60000)
}

export function appointmentLockIds(professionalId, start, end) {
  if (!professionalId) throw new Error('Selecciona un profesional.')
  const slotMs = 15 * 60 * 1000
  const ids = []
  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += slotMs) {
    ids.push(`${professionalId}_${Math.floor(cursor / slotMs)}`)
  }
  return ids
}

export function formatAppointmentRange(appointment, timeZone = 'America/Lima') {
  const start = appointment?.startAt?.toDate?.() || new Date(appointment?.startAt)
  const end = appointment?.endAt?.toDate?.() || new Date(appointment?.endAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Horario no disponible'
  const date = new Intl.DateTimeFormat('es-PE', {
    timeZone, weekday: 'short', day: '2-digit', month: 'short'
  }).format(start)
  const hour = value => new Intl.DateTimeFormat('es-PE', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(value)
  return `${date} · ${hour(start)}–${hour(end)}`
}
