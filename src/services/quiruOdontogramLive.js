import { GoogleAIBackend, getAI, getGenerativeModel } from 'firebase/ai'
import { getToken as getAppCheckToken } from 'firebase/app-check'
import { app, appCheck } from '../config/firebase'
import { QUIRU_TEXT_MODEL } from '../config/voiceAssistant'
import { CONVERSATIONAL_ODONTOGRAM_CONFIG } from '../config/conversationalOdontogram'
import { NTS188_SYMBOLS } from '../domain/nts188/NTS188SymbolCatalog'
import { groundClinicalToolCall } from './voiceFindingGrounding'
import { speak } from '../store/odontograma'

const FINDING_KEYS = [...NTS188_SYMBOLS.map(item => item.key), 'UNKNOWN']
const NTS_CODES = [...new Set(NTS188_SYMBOLS.flatMap(item => item.codes || []))]
const catalogInstruction = NTS188_SYMBOLS
  .map(item => `6.1.${item.number} ${item.key}: ${item.label}${item.codes?.length ? ` [${item.codes.join('/')}]` : ''}`)
  .join('\n')

const tools = [{
  functionDeclarations: [
    {
      name: 'preview_finding',
      description: 'Interpreta uno o varios hallazgos de los numerales 6.1.1 a 6.1.38 y solicita validación determinista. No persiste información.',
      parameters: {
        type: 'object',
        properties: {
          findings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tooth: { type: 'integer' },
                finding: { type: 'string', enum: FINDING_KEYS },
                cariesType: { type: 'string', enum: ['WHITE_SPOT', 'ENAMEL', 'DENTIN', 'PULP'] },
                surface: { type: 'string', enum: ['OCCLUSAL', 'MESIAL', 'DISTAL', 'VESTIBULAR', 'PALATAL', 'LINGUAL', 'CERVICAL', 'INCISAL'] },
                absenceReason: { type: 'string', enum: ['NOT_ERUPTED', 'EXTRACTION_CARIES', 'OTHER'] },
                ntsCode: { type: 'string', enum: NTS_CODES },
                condition: { type: 'string', enum: ['GOOD', 'BAD'] },
                secondTooth: { type: 'integer' },
                rawText: { type: 'string' }
              },
              required: ['finding']
            }
          }
        },
        required: ['findings']
      }
    },
    {
      name: 'correct_pending_finding',
      description: 'Corrige únicamente el último hallazgo pendiente; nunca modifica uno persistido.',
      parameters: {
        type: 'object',
        properties: {
          tooth: { type: 'integer' },
            finding: { type: 'string', enum: FINDING_KEYS },
            secondTooth: { type: 'integer' },
            surface: { type: 'string', enum: ['OCCLUSAL', 'MESIAL', 'DISTAL', 'VESTIBULAR', 'PALATAL', 'LINGUAL', 'CERVICAL', 'INCISAL'] },
            ntsCode: { type: 'string', enum: NTS_CODES },
            condition: { type: 'string', enum: ['GOOD', 'BAD'] },
            cariesType: { type: 'string', enum: ['WHITE_SPOT', 'ENAMEL', 'DENTIN', 'PULP'] },
            absenceReason: { type: 'string', enum: ['NOT_ERUPTED', 'EXTRACTION_CARIES', 'OTHER'] }
        }
      }
    },
    { name: 'confirm_findings', description: 'Confirma y persiste los hallazgos pendientes solo tras confirmación explícita del odontólogo.', parameters: { type: 'object', properties: {} } },
    { name: 'undo_pending_finding', description: 'Descarta únicamente el último hallazgo pendiente.', parameters: { type: 'object', properties: {} } },
    { name: 'get_current_session_findings', description: 'Devuelve un resumen mínimo de la sesión actual.', parameters: { type: 'object', properties: {} } },
    { name: 'finish_session', description: 'Finaliza la sesión; advierte si quedan hallazgos pendientes.', parameters: { type: 'object', properties: {} } }
  ]
}]

const instruction = `Eres QUIRU, asistente de registro odontológico para un cirujano dentista.
Mantén una conversación ágil y natural en español peruano. Responde con máximo 12 palabras, sin introducciones ni repetir toda la instrucción del odontólogo.
La IA interpreta; el motor NTS valida; el odontólogo confirma.
Usa preview_finding para cualquiera de los 38 hallazgos del catálogo. Nunca inventes pieza, segunda pieza, superficie, sigla, estado, clasificación ni motivo de ausencia.
Para "de la pieza X a la Y", "entre X e Y", diastema, fusión, ortodoncia, prótesis o transposición, envía tooth y secondTooth.
GOOD significa buen estado/azul y BAD significa mal estado/rojo. Envía ntsCode únicamente si el odontólogo lo expresó o es inequívoco por el nombre clínico.
Si el motor devuelve valid=false, pregunta únicamente el primer dato faltante.
Después de un preview válido resume como "16, CD oclusal. ¿Confirmas?". Si son varios, agrúpalos en una sola pregunta.
Solo ante confirmación explícita en un turno posterior usa confirm_findings.
Un hallazgo nombrado explícitamente siempre reemplaza al anterior. Nunca reutilices el tipo, sigla, superficie o pieza del turno previo si el odontólogo menciona un hallazgo nuevo.
Aunque existan otros hallazgos pendientes, cada frase que nombre un hallazgo clínico nuevo debe usar preview_finding y agregar otro registro. Usa correct_pending_finding solo si el odontólogo expresa una corrección con palabras como "corrige", "no era", "quise decir", "cambia" o "modifica".
Solo una frase que empiece explícitamente con "también" o "igual", sin nombrar otro hallazgo, puede heredar el tipo y clasificación anteriores; nunca hereda una superficie omitida.
Las correcciones solo afectan pendientes. Nunca afirmes que algo se guardó sin success=true.
No diagnostiques, no recomiendes tratamientos y no solicites datos personales del paciente.
Ejecuta como máximo una herramienta por turno. Tras guardar responde únicamente "Registrado. Continúa.".

Catálogo exacto de claves permitidas:
${catalogInstruction}`

function normalizedSpeech(text = '') {
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function localCommand(text, pendingField = null) {
  const value = normalizedSpeech(text)
  if (pendingField === 'condition') {
    if (/^(bien|bueno|buen estado|esta bien|en buen estado)$/.test(value)) return 'condition_good'
    if (/^(mal|malo|mal estado|esta mal|en mal estado)$/.test(value)) return 'condition_bad'
  }
  if (/^(si|correcto|confirmo|confirma|confirmar|confirmado|de acuerdo|esta bien|ok|okay|dale|listo|guardar|guarda|guardalo)$/.test(value)) return 'confirm'
  if (/^(deshacer|deshaz|borra lo ultimo|cancela lo ultimo)$/.test(value)) return 'undo'
  if (/^(resumen|que llevamos|que hemos registrado)$/.test(value)) return 'summary'
  if (/^(terminar|terminamos|finalizar|finaliza|fin de la atencion)$/.test(value)) return 'finish'
  if (/^(pausa|pausar|detener voz|deten la voz)$/.test(value)) return 'stop'
  return null
}

function functionResponse(call, value) {
  return { functionResponse: { name: call.name, response: value } }
}

function recognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition
}

function safeError(error) {
  const value = `${error?.code || ''} ${error?.name || ''} ${error?.message || ''}`.toLowerCase()
  if (value.includes('app-check') || value.includes('appcheck')) return 'Firebase App Check no autorizó este navegador.'
  if (value.includes('notallowed') || value.includes('not-allowed') || value.includes('permission')) return 'El permiso del micrófono fue denegado.'
  if (value.includes('no-speech')) return 'No pude escuchar tu voz. Inténtalo nuevamente.'
  if (value.includes('audio-capture') || value.includes('notfound')) return 'No se encontró un micrófono disponible.'
  if (value.includes('quota') || value.includes('429')) return 'El asistente alcanzó temporalmente su límite de uso.'
  if (value.includes('unsupported')) return 'Este navegador no admite la conversación por voz.'
  return 'El asistente de voz no está disponible temporalmente.'
}

export async function startQuiruOdontogramLive(callbacks) {
  const SpeechRecognition = recognitionConstructor()
  if (!SpeechRecognition || !window.speechSynthesis || !navigator.mediaDevices?.getUserMedia) {
    const error = new Error('unsupported voice browser')
    error.code = 'ai/unsupported'
    throw error
  }
  if (!appCheck) throw new Error('app-check/not-configured')

  await getAppCheckToken(appCheck)
  const ai = getAI(app, { backend: new GoogleAIBackend() })
  const model = getGenerativeModel(ai, {
    model: QUIRU_TEXT_MODEL,
    systemInstruction: instruction,
    tools,
    generationConfig: { maxOutputTokens: 100, temperature: 0.2 }
  })
  let chatSession = model.startChat()
  const recognition = new SpeechRecognition()
  recognition.lang = 'es-PE'
  recognition.continuous = false
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  let active = true
  let processing = false
  let stopped = false
  let inactivityTimer
  let maximumTimer
  let restartTimer
  let inactivityWarningSent = false
  let retries = 0
  let pendingClarification = null

  const resetChatContext = () => {
    chatSession = model.startChat()
  }

  const scheduleListening = (delay = 350) => {
    clearTimeout(restartTimer)
    if (!active || processing || stopped) return
    restartTimer = setTimeout(() => startListening(), delay)
  }

  const startListening = () => {
    if (!active || processing || stopped) return
    try { recognition.start() } catch (error) {
      if (String(error?.message || '').toLowerCase().includes('already')) {
        scheduleListening()
        return
      }
      throw error
    }
  }

  recognition.onstart = () => {
    if (!active || stopped) return
    processing = false
    callbacks.onState?.('listening')
  }
  recognition.onsoundstart = () => callbacks.onSoundStart?.()
  recognition.onspeechstart = () => callbacks.onSoundStart?.()

  const stop = async reason => {
    if (stopped) return
    stopped = true
    active = false
    clearTimeout(inactivityTimer)
    clearTimeout(maximumTimer)
    clearTimeout(restartTimer)
    try { recognition.abort() } catch (error) {}
    window.speechSynthesis?.cancel()
    callbacks.onState?.('idle', reason)
  }

  const speakAndListen = async text => {
    if (!active) return
    try { recognition.abort() } catch (error) {}
    await speak(String(text || '').replace(/[*_`#>~|]+/g, ' ').trim(), { manageRecognition: false, rate: 1.18 })
    processing = false
    if (active) startListening()
  }

  const armInactivity = () => {
    clearTimeout(inactivityTimer)
    inactivityTimer = setTimeout(async () => {
      if (!active) return
      if (!inactivityWarningSent) {
        inactivityWarningSent = true
        processing = true
        await speakAndListen('¿Deseas continuar con la atención por voz?')
        armInactivity()
      } else {
        await stop('inactivity')
      }
    }, CONVERSATIONAL_ODONTOGRAM_CONFIG.inactivitySeconds * 1000)
  }

  const executeTool = async call => {
    callbacks.onToolCall?.(call.name)
    let result
    if (call.name === 'preview_finding') result = await callbacks.preview(call.args?.findings || [])
    else if (call.name === 'correct_pending_finding') result = await callbacks.correct(call.args || {})
    else if (call.name === 'confirm_findings') result = await callbacks.confirm()
    else if (call.name === 'undo_pending_finding') result = await callbacks.undo()
    else if (call.name === 'get_current_session_findings') result = await callbacks.summary()
    else if (call.name === 'finish_session') result = await callbacks.finish()
    else result = { success: false, error: 'Herramienta no permitida.' }
    if (call.name === 'preview_finding') {
      const results = result?.results || []
      const invalidIndex = results.findIndex(item => item?.success === false && item?.errors?.[0]?.field)
      pendingClarification = invalidIndex >= 0
        ? { field: results[invalidIndex].errors[0].field, draft: { ...(call.args?.findings?.[invalidIndex] || {}) } }
        : null
    }
    if (result?.success && ['confirm_findings', 'undo_pending_finding'].includes(call.name)) pendingClarification = null
    return { call, result }
  }

  const executeLocalCommand = async (command, wasInactivityPrompt) => {
    if (wasInactivityPrompt && command === 'confirm') {
      await speakAndListen('Continúa.')
      return true
    }
    if (command === 'stop') {
      await speak('Asistencia por voz pausada.', { manageRecognition: false, rate: 1.18 })
      await stop('user')
      return true
    }
    if (command === 'condition_good' || command === 'condition_bad') {
      const finding = { ...(pendingClarification?.draft || {}), condition: command === 'condition_good' ? 'GOOD' : 'BAD' }
      callbacks.onToolCall?.('preview_finding')
      const executed = await executeTool({ name: 'preview_finding', args: { findings: [finding] } })
      const item = executed.result?.results?.[0]
      if (item?.success) {
        const preview = item.preview || {}
        const detail = [preview.tooth, preview.ntsCode, preview.surfaceLabel].filter(Boolean).join(', ')
        await speakAndListen(`${detail || 'Hallazgo preparado'}. ¿Confirmas?`)
      } else {
        await speakAndListen(item?.errors?.[0]?.question || 'Necesito una aclaración adicional.')
      }
      return true
    }
    let result
    if (command === 'confirm') {
      callbacks.onToolCall?.('confirm_findings')
      result = await callbacks.confirm()
      if (result?.success) resetChatContext()
      await speakAndListen(result?.success
        ? `${result.count > 1 ? `${result.count} hallazgos registrados` : 'Registrado'}. Continúa.`
        : result?.error || 'No hay hallazgos pendientes.')
      return true
    }
    if (command === 'undo') {
      callbacks.onToolCall?.('undo_pending_finding')
      result = await callbacks.undo()
      if (result?.success) resetChatContext()
      await speakAndListen(result?.success ? 'Cambio descartado. Continúa.' : result?.error || 'No hay cambios pendientes.')
      return true
    }
    if (command === 'summary') {
      callbacks.onToolCall?.('get_current_session_findings')
      result = await callbacks.summary()
      await speakAndListen(`${result?.persisted || 0} confirmados y ${result?.pending || 0} pendientes.`)
      return true
    }
    if (command === 'finish') {
      callbacks.onToolCall?.('finish_session')
      result = await callbacks.finish()
      if (result?.success) {
        await speak('Atención guardada.', { manageRecognition: false, rate: 1.18 })
        await stop('finished')
      } else {
        await speakAndListen(result?.error || `Hay ${result?.pending || 0} hallazgos pendientes.`)
      }
      return true
    }
    return false
  }

  const processTurn = async transcript => {
    if (!active || processing) return
    processing = true
    callbacks.onActivity?.()
    callbacks.onVoiceTurn?.()
    const wasInactivityPrompt = inactivityWarningSent
    inactivityWarningSent = false
    armInactivity()
    callbacks.onState?.('processing')
    try {
      const command = localCommand(transcript, pendingClarification?.field)
      if (command && await executeLocalCommand(command, wasInactivityPrompt)) {
        retries = 0
        return
      }
      callbacks.onAiRequest?.()
      let modelResponse = (await chatSession.sendMessage(transcript)).response
      let resetAfterTurn = false
      for (let turn = 0; turn < 2; turn += 1) {
        const calls = modelResponse.functionCalls?.() || []
        if (!calls.length) break
        if (calls.length > 1) {
          modelResponse = (await chatSession.sendMessage([functionResponse(calls[0], {
            success: false, error: 'Solo se permite una herramienta por turno.'
          })])).response
          break
        }
        const groundedCall = groundClinicalToolCall(calls[0], transcript)
        const executed = await executeTool(groundedCall)
        modelResponse = (await chatSession.sendMessage([functionResponse(executed.call, executed.result)])).response
        if (executed.result?.success && ['confirm_findings', 'undo_pending_finding'].includes(executed.call.name)) resetAfterTurn = true
        if (executed.call.name === 'finish_session' && executed.result?.success) {
          await speak('Atención guardada.', { manageRecognition: false, rate: 1.18 })
          await stop('finished')
          return
        }
      }
      retries = 0
      callbacks.onState?.('listening')
      const responseText = modelResponse.text?.() || 'Continúa, por favor.'
      if (resetAfterTurn) resetChatContext()
      await speakAndListen(responseText)
    } catch (error) {
      retries += 1
      processing = false
      if (retries <= CONVERSATIONAL_ODONTOGRAM_CONFIG.maxRetries && active) {
        callbacks.onState?.('listening')
        await speakAndListen('No pude procesarlo. Repítelo, por favor.')
      } else {
        callbacks.onError?.(safeError(error))
        await stop('error')
      }
    }
  }

  recognition.onresult = event => {
    let finalTranscript = ''
    let interimTranscript = ''
    for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
      const result = event.results[index]
      const text = result?.[0]?.transcript?.trim() || ''
      if (!text) continue
      if (result.isFinal) finalTranscript += `${text} `
      else interimTranscript += `${text} `
    }
    if (interimTranscript.trim()) callbacks.onInterimTranscript?.(interimTranscript.trim())
    if (finalTranscript.trim()) {
      const transcript = finalTranscript.trim()
      callbacks.onTranscript?.(transcript)
      processTurn(transcript)
    }
  }
  recognition.onerror = event => {
    if (!active || event.error === 'aborted') return
    if (event.error === 'no-speech') {
      processing = false
      scheduleListening()
      return
    }
    callbacks.onError?.(safeError({ code: event.error, name: event.error }))
    stop('error')
  }
  recognition.onend = () => {
    if (active && !processing && !window.speechSynthesis?.speaking) scheduleListening()
  }

  callbacks.onState?.('requesting_permission')
  await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    stream.getTracks().forEach(track => track.stop())
  })
  // Da tiempo al navegador para liberar la pista de validación antes de que
  // SpeechRecognition adquiera el mismo dispositivo.
  await new Promise(resolve => setTimeout(resolve, 150))
  callbacks.onState?.('connecting')
  armInactivity()
  maximumTimer = setTimeout(() => stop('maximum-duration'), CONVERSATIONAL_ODONTOGRAM_CONFIG.maxSessionMinutes * 60 * 1000)
  callbacks.onState?.('listening')
  processing = true
  await speakAndListen('Hola, soy QUIRU. El micrófono está activo; puedes comenzar.')

  return { stop }
}

export { safeError as quiruLiveErrorMessage }
