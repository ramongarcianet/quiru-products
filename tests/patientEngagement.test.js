import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWhatsAppNumber, patientsWithUpcomingBirthdays } from '../src/services/patientEngagement.js'

test('encuentra cumpleaños en los próximos 15 días incluso al cambiar de año', () => {
  const patients = [
    { id: 'hoy', nombre: 'Ana', fechaNacimiento: '1990-12-27', estado: true },
    { id: 'enero', nombre: 'Luis', fechaNacimiento: '1985-01-03', estado: true },
    { id: 'fuera', nombre: 'Eva', fechaNacimiento: '1992-01-12', estado: true },
  ]
  const result = patientsWithUpcomingBirthdays(patients, new Date('2027-12-27T15:00:00Z'))
  assert.deepEqual(result.map(patient => patient.id), ['hoy', 'enero'])
  assert.deepEqual(result.map(patient => patient.daysUntilBirthday), [0, 7])
})

test('normaliza el teléfono peruano para WhatsApp', () => {
  assert.equal(normalizeWhatsAppNumber('987 654 321'), '51987654321')
  assert.equal(normalizeWhatsAppNumber('+51 987 654 321'), '51987654321')
  assert.equal(normalizeWhatsAppNumber('123'), '')
})
