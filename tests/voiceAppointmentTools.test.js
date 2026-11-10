import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appointmentDraftSpeechSummary,
  classifyAppointmentVoiceCommand,
  searchAuthorizedPatients
} from '../src/services/voiceAppointmentTools.js'

const patients = [{
  id: 'patient-ramon',
  idOdontologo: 'doctor-1',
  estado: true,
  nombre: 'Ramón',
  apellidoPaterno: 'García',
  apellidoMaterno: 'Ayachi',
  tipoDocumento: 'DNI',
  numeroDocumento: '42319343'
}]

test('encuentra un paciente cuando la frase contiene nombre y DNI', () => {
  const found = searchAuthorizedPatients(
    patients,
    'genera una cita para Ramon Garcia con dni 42319343',
    'doctor-1'
  )

  assert.equal(found.length, 1)
  assert.equal(found[0].id, 'patient-ramon')
  assert.equal(found[0].numeroDocumento, '42319343')
})

test('normaliza un DNI dictado con espacios y mantiene el aislamiento por odontólogo', () => {
  assert.equal(searchAuthorizedPatients(patients, 'DNI 42 319 343', 'doctor-1').length, 1)
  assert.equal(searchAuthorizedPatients(patients, 'DNI 42319343', 'doctor-2').length, 0)
})

test('resuelve confirmaciones de una cita localmente', () => {
  for (const reply of ['sí', 'está bien', 'ok', 'dale', 'confirmado', 'guárdalo']) {
    assert.equal(
      classifyAppointmentVoiceCommand(reply, { awaitingConfirmation: true }),
      'confirm',
      reply
    )
  }
})

test('no confirma si todavía no existe un resumen pendiente', () => {
  assert.equal(classifyAppointmentVoiceCommand('sí'), null)
})

test('resuelve cancelación y modificación sin usar Gemini', () => {
  assert.equal(classifyAppointmentVoiceCommand('cancelar'), 'cancel')
  assert.equal(
    classifyAppointmentVoiceCommand('quiero cambiar', { awaitingConfirmation: true }),
    'modify'
  )
  assert.equal(
    classifyAppointmentVoiceCommand('no', { awaitingConfirmation: true }),
    'modify'
  )
})

test('genera localmente un resumen de confirmación breve', () => {
  const summary = appointmentDraftSpeechSummary({
    patientName: 'Ana Torres',
    dateLabel: 'miércoles, 21 de octubre de 2026',
    startTime: '10:00',
    endTime: '10:30',
    reason: 'control'
  })
  assert.equal(
    summary,
    'Ana Torres, miércoles, 21 de octubre de 2026, de 10:00 a 10:30, por control. ¿Confirmas?'
  )
})
