import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appointmentCountsForMonth,
  appointmentEnd,
  appointmentLockIds,
  customersWithUpcomingBirthdays,
  customersApproachingMonthlyFollowUp,
  localDateTime,
  normalizeWhatsAppNumber
} from '../apps/smart-agenda/src/domain/booking.js'

test('calcula el fin de una reserva usando la duración del servicio', () => {
  const start = localDateTime('2027-01-15', '09:30')
  const end = appointmentEnd(start, 45)
  assert.equal(end.getHours(), 10)
  assert.equal(end.getMinutes(), 15)
})

test('genera bloqueos de 15 minutos para impedir reservas concurrentes', () => {
  const start = localDateTime('2027-01-15', '09:30')
  const end = appointmentEnd(start, 45)
  const locks = appointmentLockIds('professional-1', start, end)
  assert.equal(locks.length, 3)
  assert.equal(new Set(locks).size, 3)
  assert.ok(locks.every(lock => lock.startsWith('professional-1_')))
})

test('rechaza fechas, horas y duraciones inválidas', () => {
  assert.throws(() => localDateTime('', '09:00'), /fecha y una hora válidas/)
  assert.throws(() => appointmentEnd(new Date(), 10), /duración debe estar entre/)
})

test('normaliza celulares para enlaces wa.me', () => {
  assert.equal(normalizeWhatsAppNumber('+51 987 654 321', '51'), '51987654321')
  assert.equal(normalizeWhatsAppNumber('987654321', '51'), '51987654321')
  assert.equal(normalizeWhatsAppNumber('123', '51'), '')
})

test('lista clientes próximos a cumplir un mes desde su última atención', () => {
  const now = new Date('2027-02-01T12:00:00')
  const appointments = [
    { id: 'old', customerId: 'c1', customerName: 'Ana', status: 'completed', startAt: new Date('2027-01-02T10:00:00') },
    { id: 'latest', customerId: 'c1', customerName: 'Ana', status: 'completed', startAt: new Date('2027-01-07T10:00:00') },
    { id: 'recent', customerId: 'c2', customerName: 'Luis', status: 'completed', startAt: new Date('2027-01-28T10:00:00') },
    { id: 'cancelled', customerId: 'c3', customerName: 'Eva', status: 'cancelled', startAt: new Date('2027-01-05T10:00:00') }
  ]
  const result = customersApproachingMonthlyFollowUp(appointments, [{ id: 'c1', phone: '999111222' }], now)
  assert.equal(result.length, 1)
  assert.equal(result[0].customerName, 'Ana')
  assert.equal(result[0].customerPhone, '999111222')
  assert.equal(result[0].daysUntilMonth, 5)
})

test('lista cumpleaños desde hoy hasta los próximos 15 días y cruza el fin de año', () => {
  const now = new Date('2027-12-27T15:00:00Z')
  const customers = [
    { id: 'today', name: 'Ana', birthday: '1990-12-27', phone: '999111222', active: true },
    { id: 'new-year', name: 'Luis', birthday: '1985-01-03', active: true },
    { id: 'limit', name: 'Eva', birthday: '1992-01-11', active: true },
    { id: 'outside', name: 'Mario', birthday: '1992-01-12', active: true },
    { id: 'inactive', name: 'Elena', birthday: '1992-12-30', active: false },
    { id: 'missing', name: 'Sin fecha', active: true }
  ]

  const result = customersWithUpcomingBirthdays(customers, now, 15, 'America/Lima')
  assert.deepEqual(result.map(customer => customer.customerId), ['today', 'new-year', 'limit'])
  assert.equal(result[0].daysUntilBirthday, 0)
  assert.equal(result[1].daysUntilBirthday, 7)
  assert.equal(result[2].daysUntilBirthday, 15)
})

test('cuenta citas atendidas y canceladas del mes actual', () => {
  const now = new Date('2027-04-20T12:00:00Z')
  const appointments = [
    { status: 'completed', startAt: new Date('2027-04-01T10:00:00Z') },
    { status: 'completed', startAt: new Date('2027-04-19T20:00:00Z') },
    { status: 'cancelled', startAt: new Date('2027-04-22T15:00:00Z') },
    { status: 'confirmed', startAt: new Date('2027-04-23T15:00:00Z') },
    { status: 'cancelled', startAt: new Date('2027-03-30T15:00:00Z') }
  ]

  assert.deepEqual(appointmentCountsForMonth(appointments, now, 'America/Lima'), {
    completed: 2,
    cancelled: 1
  })
})
