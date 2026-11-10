const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PATTERN = /^(\d{2}):(\d{2})$/

export function normalizePatientSearch(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function classifyAppointmentVoiceCommand(value, { awaitingConfirmation = false } = {}) {
  const normalized = normalizePatientSearch(value)
  if (/^(cancelar|cancela|cancelalo|olvidalo|salir|detener)$/.test(normalized)) return 'cancel'
  if (!awaitingConfirmation) return null
  if (/^(si|confirmo|confirma|confirmar|confirmado|correcto|de acuerdo|esta bien|ok|okay|dale|listo|guardar|guarda|guardalo)$/.test(normalized)) return 'confirm'
  if (/^(no|modificar|modifica|cambiar|cambia|quiero cambiar|corregir|corrige)$/.test(normalized)) return 'modify'
  return null
}

export function appointmentDraftSpeechSummary(draft) {
  if (!draft) return ''
  return `${draft.patientName}, ${draft.dateLabel}, de ${draft.startTime} a ${draft.endTime}, por ${draft.reason}. ¿Confirmas?`
}

export function patientFullName(patient = {}) {
  return [patient.nombre, patient.apellidoPaterno, patient.apellidoMaterno]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function searchAuthorizedPatients(patients, query, userId) {
  const normalizedQuery = normalizePatientSearch(query)
  if (!normalizedQuery || !userId) return []
  const digitGroups = normalizedQuery.match(/\d+/g) || []
  const documentCandidates = [
    ...digitGroups,
    digitGroups.join('')
  ].filter((value, index, values) => value.length >= 6 && values.indexOf(value) === index)
  const ignoredWords = new Set([
    'agenda', 'agendar', 'cita', 'crear', 'genera', 'generar', 'para', 'con',
    'dni', 'documento', 'identidad', 'numero', 'paciente', 'al', 'a', 'el', 'la'
  ])
  const nameTokens = normalizedQuery
    .split(' ')
    .filter(token => !/^\d+$/.test(token) && !ignoredWords.has(token))

  return (patients || [])
    .filter(patient => patient?.estado !== false && patient?.idOdontologo === userId)
    .filter(patient => {
      const documentNumber = normalizePatientSearch(patient.numeroDocumento).replace(/\s/g, '')
      const documentMatches = documentCandidates.length === 0 || documentCandidates.includes(documentNumber)
      const name = normalizePatientSearch(patientFullName(patient))
      // Un documento completo es más preciso que las palabras accesorias que
      // SpeechRecognition pueda conservar alrededor del nombre.
      const nameMatches = documentCandidates.length > 0 ||
        nameTokens.length === 0 || nameTokens.every(token => name.includes(token))
      return documentMatches && nameMatches
    })
    .slice(0, 5)
    .map(patient => ({
      id: patient.id,
      nombreCompleto: patientFullName(patient),
      tipoDocumento: patient.tipoDocumento || '',
      numeroDocumento: String(patient.numeroDocumento || '')
    }))
}

function parseLocalDateTime(dateValue, timeValue) {
  const dateMatch = DATE_PATTERN.exec(String(dateValue || ''))
  const timeMatch = TIME_PATTERN.exec(String(timeValue || ''))
  if (!dateMatch || !timeMatch) throw new Error('La fecha u hora no tiene un formato válido.')

  const [, yearText, monthText, dayText] = dateMatch
  const [, hourText, minuteText] = timeMatch
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (hour > 23 || minute > 59) throw new Error('La hora indicada no es válida.')

  const date = new Date(year, month - 1, day, hour, minute, 0, 0)
  if (
    date.getFullYear() !== year || date.getMonth() !== month - 1 ||
    date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute
  ) {
    throw new Error('La fecha indicada no es válida.')
  }
  return date
}

function formatTime(date, timeZone) {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

// FullCalendar está configurado con una zona horaria nominal sin plugin de zona.
// Las citas existentes guardan la hora local como UTC (por ejemplo, 10:00 -> 10:00Z),
// por lo que conservamos ese mismo contrato para evitar un desplazamiento de +5 h en Lima.
function toCalendarIso(date) {
  return new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    0,
    0
  )).toISOString()
}

export function buildVoiceAppointmentDraft(args, patient, doctor, timeZone) {
  if (!patient?.id) throw new Error('El paciente seleccionado ya no está disponible.')
  const duration = Number(args?.duracionMinutos)
  if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
    throw new Error('La duración debe estar entre 15 y 480 minutos.')
  }
  const reason = String(args?.motivo || '').trim()
  if (!reason) throw new Error('Falta el motivo de la cita.')

  const start = parseLocalDateTime(args.fecha, args.horaInicio)
  if (start.getTime() < Date.now() - 60000) throw new Error('No se puede registrar una cita en el pasado.')
  const end = new Date(start.getTime() + duration * 60000)
  const dateLabel = new Intl.DateTimeFormat('es-PE', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(start)
  const startTime = formatTime(start, timeZone)
  const endTime = formatTime(end, timeZone)
  const patientName = patientFullName(patient)
  const location = [doctor?.nombreconsultorio, doctor?.direccion].filter(Boolean).join(' - ')

  return {
    patientId: patient.id,
    patientName,
    dateLabel,
    startTime,
    endTime,
    duration,
    reason,
    payload: {
      idPaciente: patient.id,
      start: toCalendarIso(start),
      end: toCalendarIso(end),
      timeStart: startTime,
      timeEnd: endTime,
      title: reason,
      borderColor: 'rgba(0, 102, 255, 0.18)',
      backgroundColor: '#eef3ff',
      textColor: '#071b40',
      timedisplay: `${dateLabel}     ${startTime} - ${endTime}`,
      fechaDeCreacion: new Date().toISOString().slice(0, 10),
      email: patient.email || '',
      location,
      Mensaje: String(args?.mensaje || '').trim()
    }
  }
}

export function countAppointmentOverlaps(appointments, draft) {
  const start = new Date(draft.payload.start).getTime()
  const end = new Date(draft.payload.end).getTime()
  return (appointments || []).filter(appointment => {
    if (appointment?.estado === false || appointment?.title === 'Disponible') return false
    const appointmentStart = new Date(appointment.start).getTime()
    const appointmentEnd = new Date(appointment.end).getTime()
    return Number.isFinite(appointmentStart) && Number.isFinite(appointmentEnd)
      && start < appointmentEnd && end > appointmentStart
  }).length
}
