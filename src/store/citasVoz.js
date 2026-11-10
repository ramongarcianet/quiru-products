import { computed, ref } from 'vue'
import { collection, getDocs, query, where } from 'firebase/firestore'
import {
  GoogleAIBackend,
  getAI,
  getGenerativeModel
} from 'firebase/ai'
import { getToken as getAppCheckToken } from 'firebase/app-check'
import { app, appCheck, firestore } from '../config/firebase'
import {
  QUIRU_APPOINTMENT_TOOLS,
  QUIRU_TEXT_MODEL,
  buildQuiruAppointmentInstruction
} from '../config/voiceAssistant'
import { registro as patients } from './paciente'
import { registro as appointments, guardarCita } from './citas'
import { item as doctor } from './usuario'
import { miUsuario, usuario } from './sesion'
import { activarVoz, detenerVoz, isSpeech, speak } from './odontograma'
import {
  appointmentDraftSpeechSummary,
  buildVoiceAppointmentDraft,
  classifyAppointmentVoiceCommand,
  countAppointmentOverlaps,
  patientFullName,
  searchAuthorizedPatients
} from '../services/voiceAppointmentTools'

export const voicePanelOpen = ref(false)
export const voiceAppointmentState = ref('idle')
export const voiceAppointmentError = ref('')
export const voiceAppointmentDraft = ref(null)
export const voicePatientMatches = ref([])
export const voiceAppointmentMetrics = ref({ geminiRequests: 0, localTurns: 0 })
export const voiceAppointmentMessage = ref('')
export const voiceAppointmentTranscript = ref('')

export const voiceAppointmentBusy = computed(() => [
  'requesting_permission', 'connecting', 'processing', 'creating'
].includes(voiceAppointmentState.value))

let chatSession = null
let appointmentModel = null
let speechRecognition = null
let conversationActive = false
let wasOdontogramListening = false
let creationPromise = null
let createdAppointmentId = null

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Lima'

function currentUserId() {
  return miUsuario()?.uid || usuario.value?.uid || ''
}

function functionResponse(call, response) {
  return {
    functionResponse: {
      name: call.name,
      response
    }
  }
}

function resetGeminiChat() {
  chatSession = appointmentModel?.startChat?.() || null
}

function appointmentTurnInput(transcript) {
  const draft = voiceAppointmentDraft.value
  if (!draft) return transcript
  return `Borrador actual: pacienteId=${draft.patientId}; paciente=${draft.patientName}; fecha=${draft.payload.start.slice(0, 10)}; horaInicio=${draft.startTime}; duracionMinutos=${draft.duration}; motivo=${draft.reason}. Solicitud del usuario: ${transcript}`
}

function safeErrorMessage(error) {
  const code = String(error?.code || '')
  const name = String(error?.name || '')
  const message = String(error?.message || '')
  const details = `${code} ${name} ${message}`.toLowerCase()
  const status = Number(error?.customData?.status || error?.customErrorData?.status || 0)
  if (name === 'NotAllowedError') return 'El permiso del micrófono fue denegado.'
  if (name === 'NotFoundError') return 'No se encontró un micrófono disponible.'
  if (details.includes('app-check') || details.includes('appcheck')) {
    return 'Firebase App Check no autorizó este navegador. Registra el token de desarrollo o configura reCAPTCHA Enterprise.'
  }
  if (status === 429 || details.includes('prepayment credits') || details.includes('quota')) {
    return 'Gemini no tiene cuota disponible. Revisa los créditos y la facturación del proyecto quiru-prod en Google AI Studio.'
  }
  if (details.includes('not-allowed')) return 'El permiso del micrófono fue denegado.'
  if (details.includes('no-speech')) return 'No pude escuchar tu voz. Presiona Reintentar y vuelve a hablar.'
  if (details.includes('audio-capture')) return 'No se encontró un micrófono disponible.'
  if (code.includes('api-not-enabled')) return 'Firebase AI Logic aún no está habilitado para el proyecto de datos.'
  if (code.includes('unsupported')) return 'Este navegador no admite la conversación de voz en tiempo real.'
  if (code.includes('fetch-error')) return 'No se pudo conectar con QUIRU. Revisa tu conexión e inténtalo nuevamente.'
  return 'No se pudo iniciar el asistente de citas. Inténtalo nuevamente.'
}

function spokenText(value = '') {
  return String(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>~|]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function getAuthorizedPatient(patientId) {
  const uid = currentUserId()
  return patients.value.find(patient => (
    patient.id === patientId && patient.estado !== false && patient.idOdontologo === uid
  ))
}

async function findAuthorizedPatients(searchText) {
  const uid = currentUserId()
  const localMatches = searchAuthorizedPatients(patients.value, searchText, uid)
  if (localMatches.length) return localMatches

  // Respaldo para el caso en que el snapshot de pacientes aún no terminó de cargar.
  const snapshot = await getDocs(query(
    collection(firestore, 'paciente'),
    where('idOdontologo', '==', uid),
    where('estado', '==', true)
  ))
  const freshPatients = snapshot.docs.map(patientDoc => ({
    ...patientDoc.data(),
    id: patientDoc.id
  }))
  freshPatients.forEach(patient => {
    if (!patients.value.some(existing => existing.id === patient.id)) patients.value.push(patient)
  })
  return searchAuthorizedPatients(freshPatients, searchText, uid)
}

function prepareAppointment(args) {
  const patient = getAuthorizedPatient(args?.pacienteId)
  const draft = buildVoiceAppointmentDraft(args, patient, doctor.value, timeZone())
  const overlaps = countAppointmentOverlaps(appointments.value, draft)
  voiceAppointmentDraft.value = { ...draft, overlaps }
  createdAppointmentId = null
  voiceAppointmentState.value = 'awaiting_confirmation'
  return {
    success: true,
    requiereConfirmacion: true,
    resumen: {
      paciente: draft.patientName,
      fecha: draft.dateLabel,
      horaInicio: draft.startTime,
      horaFin: draft.endTime,
      duracionMinutos: draft.duration,
      motivo: draft.reason
    },
    advertenciaSuperposicion: overlaps > 0
      ? `Se detectaron ${overlaps} citas superpuestas. Esto es solo una advertencia, no una validación definitiva de disponibilidad.`
      : null
  }
}

async function persistPreparedAppointment() {
  if (createdAppointmentId) {
    return { success: true, citaId: createdAppointmentId, duplicadoEvitado: true }
  }
  if (voiceAppointmentState.value !== 'awaiting_confirmation' || !voiceAppointmentDraft.value) {
    return { success: false, error: 'La cita todavía no tiene un resumen pendiente de confirmación.' }
  }
  if (creationPromise) return creationPromise

  const draft = voiceAppointmentDraft.value
  const patient = getAuthorizedPatient(draft.patientId)
  if (!patient || patientFullName(patient) !== draft.patientName) {
    return { success: false, error: 'El paciente ya no está disponible o sus datos cambiaron.' }
  }

  voiceAppointmentState.value = 'creating'
  creationPromise = guardarCita(draft.payload)
    .then(citaId => {
      createdAppointmentId = citaId
      voiceAppointmentState.value = 'success'
      return {
        success: true,
        citaId,
        paciente: draft.patientName,
        fecha: draft.dateLabel,
        horaInicio: draft.startTime,
        horaFin: draft.endTime
      }
    })
    .catch(() => {
      voiceAppointmentState.value = 'error'
      voiceAppointmentError.value = 'No pude registrar la cita. Podemos intentarlo nuevamente.'
      return { success: false, error: voiceAppointmentError.value }
    })
    .finally(() => {
      creationPromise = null
    })

  return creationPromise
}

async function handleFunctionCalls(functionCalls) {
  const call = functionCalls?.[0]
  if (!call) return { text: 'No se recibió una herramienta válida.' }
  voiceAppointmentState.value = 'processing'

  try {
    if (functionCalls.length > 1) {
      voiceAppointmentState.value = voiceAppointmentDraft.value ? 'awaiting_confirmation' : 'listening'
      return functionResponse(call, {
        success: false,
        error: 'QUIRU solo permite ejecutar una herramienta por turno.'
      })
    }

    if (call.name === 'buscar_paciente') {
      const found = await findAuthorizedPatients(call.args?.consulta)
      voicePatientMatches.value = found
      voiceAppointmentState.value = 'listening'
      return functionResponse(call, { encontrados: found })
    }

    if (call.name === 'preparar_cita') {
      return functionResponse(call, prepareAppointment(call.args))
    }

    if (call.name === 'confirmar_cita') {
      return functionResponse(call, await persistPreparedAppointment())
    }

    if (call.name === 'cancelar_cita') {
      voiceAppointmentDraft.value = null
      voiceAppointmentState.value = 'cancelled'
      return functionResponse(call, { success: true, cancelada: true })
    }

    voiceAppointmentState.value = 'listening'
    return functionResponse(call, { success: false, error: 'Herramienta no permitida.' })
  } catch (error) {
    voiceAppointmentState.value = voiceAppointmentDraft.value ? 'awaiting_confirmation' : 'listening'
    return functionResponse(call, {
      success: false,
      error: error?.message || 'No se pudieron validar los datos de la cita.'
    })
  }
}

export function openVoiceAppointmentPanel() {
  if (['success', 'cancelled'].includes(voiceAppointmentState.value)) {
    voiceAppointmentDraft.value = null
    voicePatientMatches.value = []
    createdAppointmentId = null
    voiceAppointmentError.value = ''
    voiceAppointmentState.value = 'idle'
  }
  voicePanelOpen.value = true
}

function recognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition
}

function createRecognition() {
  const SpeechRecognition = recognitionConstructor()
  if (!SpeechRecognition) return null
  const recognition = new SpeechRecognition()
  recognition.lang = 'es-PE'
  recognition.continuous = false
  recognition.interimResults = false
  recognition.maxAlternatives = 3
  recognition.onstart = () => {
    if (!conversationActive) return
    voiceAppointmentError.value = ''
    if (!voiceAppointmentDraft.value) voiceAppointmentState.value = 'listening'
  }
  recognition.onresult = event => {
    const result = event.results?.[event.results.length - 1]
    const alternatives = result ? Array.from(result) : []
    const transcript = alternatives
      .sort((left, right) => (right.confidence || 0) - (left.confidence || 0))[0]
      ?.transcript?.trim()
    if (transcript) {
      voiceAppointmentTranscript.value = transcript
      processVoiceTurn(transcript)
    }
  }
  recognition.onend = () => {
    if (!conversationActive || voiceAppointmentState.value === 'processing') return
    if (['listening', 'awaiting_confirmation'].includes(voiceAppointmentState.value)) {
      setTimeout(() => startListening(), 250)
    }
  }
  recognition.onerror = event => {
    if (!conversationActive || event.error === 'aborted') return
    voiceAppointmentError.value = safeErrorMessage({ code: event.error, name: event.error })
    voiceAppointmentState.value = 'error'
  }
  return recognition
}

function startListening() {
  if (!conversationActive || !speechRecognition) return
  if (!voiceAppointmentDraft.value) voiceAppointmentState.value = 'listening'
  try {
    speechRecognition.start()
  } catch (error) {
    if (!String(error?.message || '').includes('already started')) throw error
  }
}

async function speakAndContinue(text) {
  const conciseText = spokenText(text)
  voiceAppointmentMessage.value = conciseText
  if (conciseText) await speak(conciseText, { manageRecognition: false, rate: 1.12 })
  if (!conversationActive || ['success', 'cancelled', 'error'].includes(voiceAppointmentState.value)) return
  startListening()
}

async function sendToGemini(message) {
  voiceAppointmentMetrics.value.geminiRequests += 1
  return chatSession.sendMessage(message)
}

function localToolAnswer(call, responsePart) {
  const response = responsePart?.functionResponse?.response || {}
  if (response.error) return response.error
  if (call.name === 'preparar_cita' && voiceAppointmentDraft.value) {
    return appointmentDraftSpeechSummary(voiceAppointmentDraft.value)
  }
  if (call.name === 'confirmar_cita' && response.success) {
    return `Listo. La cita de ${response.paciente} quedó registrada para ${response.fecha}, de ${response.horaInicio} a ${response.horaFin}.`
  }
  if (call.name === 'cancelar_cita' && response.success) return 'Registro de cita cancelado.'
  if (call.name === 'buscar_paciente') {
    const found = response.encontrados || []
    if (!found.length) return 'No encontré ese paciente. Indícame otro nombre o documento.'
    if (found.length === 1) return `Encontré a ${found[0].nombreCompleto}. Indícame fecha, hora, duración y motivo.`
    return `Encontré ${found.length} pacientes. Dime el nombre completo o documento.`
  }
  return 'Continúa, por favor.'
}

async function answerAfterFunction(call, responsePart) {
  if (call.name !== 'buscar_paciente') {
    const answer = localToolAnswer(call, responsePart)
    resetGeminiChat()
    return answer
  }

  const response = (await sendToGemini([responsePart])).response
  const calls = response.functionCalls?.() || []
  if (!calls.length) return response.text?.() || localToolAnswer(call, responsePart)

  const nextCall = calls[0]
  const nextPart = await handleFunctionCalls(calls)
  const answer = localToolAnswer(nextCall, nextPart)
  resetGeminiChat()
  return answer
}

async function processVoiceTurn(transcript) {
  if (!conversationActive || !chatSession) return
  voiceAppointmentError.value = ''
  try {
    const localCommand = classifyAppointmentVoiceCommand(transcript, {
      awaitingConfirmation: voiceAppointmentState.value === 'awaiting_confirmation' && Boolean(voiceAppointmentDraft.value)
    })
    if (localCommand) {
      voiceAppointmentMetrics.value.localTurns += 1
      if (localCommand === 'confirm') {
        const result = await persistPreparedAppointment()
        const answer = result.success
          ? `Listo. La cita de ${result.paciente} quedó registrada para ${result.fecha}, de ${result.horaInicio} a ${result.horaFin}.`
          : result.error
        await speakAndContinue(answer)
        if (result.success) await stopVoiceAppointmentConversation(false)
        return
      }
      if (localCommand === 'modify') {
        voiceAppointmentState.value = 'listening'
        await speakAndContinue('¿Qué dato deseas cambiar?')
        return
      }
      voiceAppointmentDraft.value = null
      voiceAppointmentState.value = 'cancelled'
      await speakAndContinue('Registro de cita cancelado.')
      await stopVoiceAppointmentConversation(false)
      return
    }

    voiceAppointmentState.value = 'processing'
    const response = (await sendToGemini(appointmentTurnInput(transcript))).response
    const calls = response.functionCalls?.() || []
    let answer
    if (calls.length) {
      const responsePart = await handleFunctionCalls(calls)
      answer = await answerAfterFunction(calls[0], responsePart)
    } else {
      answer = response.text?.() || 'Continúa, por favor.'
    }
    if (voiceAppointmentState.value === 'processing') {
      voiceAppointmentState.value = voiceAppointmentDraft.value ? 'awaiting_confirmation' : 'listening'
    }
    await speakAndContinue(answer)
    if (['success', 'cancelled'].includes(voiceAppointmentState.value)) {
      await stopVoiceAppointmentConversation(false)
    }
  } catch (error) {
    console.error('[QUIRU] Error procesando la conversación de citas:', error)
    voiceAppointmentError.value = safeErrorMessage(error)
    voiceAppointmentState.value = 'error'
  }
}

export async function startVoiceAppointmentConversation() {
  if (!currentUserId()) {
    voiceAppointmentError.value = 'Debes iniciar sesión para agendar una cita.'
    voiceAppointmentState.value = 'error'
    return
  }
  if (!recognitionConstructor() || !window.speechSynthesis || !navigator.mediaDevices?.getUserMedia) {
    voiceAppointmentError.value = 'Este navegador no admite la conversación de voz en tiempo real.'
    voiceAppointmentState.value = 'error'
    return
  }

  await stopVoiceAppointmentConversation(false)
  voiceAppointmentError.value = ''
  voiceAppointmentDraft.value = null
  voicePatientMatches.value = []
  voiceAppointmentMetrics.value = { geminiRequests: 0, localTurns: 0 }
  voiceAppointmentMessage.value = ''
  voiceAppointmentTranscript.value = ''
  createdAppointmentId = null
  wasOdontogramListening = isSpeech.value
  if (wasOdontogramListening) detenerVoz()

  try {
    voiceAppointmentState.value = 'connecting'
    if (!appCheck) {
      const error = new Error('Firebase App Check no está configurado para este entorno.')
      error.code = 'app-check/not-configured'
      throw error
    }
    await getAppCheckToken(appCheck)
    const ai = getAI(app, { backend: new GoogleAIBackend() })
    appointmentModel = getGenerativeModel(ai, {
      model: QUIRU_TEXT_MODEL,
      systemInstruction: buildQuiruAppointmentInstruction(timeZone()),
      tools: QUIRU_APPOINTMENT_TOOLS,
      generationConfig: {
        maxOutputTokens: 96,
        temperature: 0.1
      }
    })
    resetGeminiChat()
    speechRecognition = createRecognition()
    conversationActive = true
    voiceAppointmentState.value = 'requesting_permission'
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      stream.getTracks().forEach(track => track.stop())
    })
    await speakAndContinue('Hola, soy QUIRU. El micrófono está activo; dime para quién deseas registrar la cita.')
  } catch (error) {
    console.error('[QUIRU] No se pudo iniciar el asistente de citas:', error)
    voiceAppointmentError.value = safeErrorMessage(error)
    voiceAppointmentState.value = 'error'
    await stopVoiceAppointmentConversation(false)
  }
}

export function modifyVoiceAppointment() {
  if (!voiceAppointmentDraft.value) return
  voiceAppointmentState.value = 'listening'
}

export async function confirmVoiceAppointmentFromUI() {
  const result = await persistPreparedAppointment()
  if (result.success) {
    const message = `Listo. La cita de ${result.paciente} quedó registrada para ${result.fecha}, de ${result.horaInicio} a ${result.horaFin}.`
    await stopVoiceAppointmentConversation(false)
    speak(message, { manageRecognition: false })
  }
  return result
}

export async function cancelVoiceAppointment() {
  voiceAppointmentDraft.value = null
  voiceAppointmentState.value = 'cancelled'
  await stopVoiceAppointmentConversation(false)
}

export async function stopVoiceAppointmentConversation(restoreOdontogram = true) {
  conversationActive = false
  if (speechRecognition) {
    try { speechRecognition.abort() } catch (error) {}
  }
  speechRecognition = null
  chatSession = null
  appointmentModel = null
  window.speechSynthesis?.cancel()
  if (restoreOdontogram && wasOdontogramListening) activarVoz()
  wasOdontogramListening = false
}

export async function closeVoiceAppointmentPanel() {
  await stopVoiceAppointmentConversation()
  voicePanelOpen.value = false
  if (!createdAppointmentId) {
    voiceAppointmentDraft.value = null
    voiceAppointmentState.value = 'idle'
  }
}
