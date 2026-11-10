<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { GoogleAIBackend, getAI, getGenerativeModel } from 'firebase/ai'
import { getToken as getAppCheckToken } from 'firebase/app-check'
import { app, appCheck } from '../../../../packages/platform/src/firebase.js'
import { appointmentEnd, localDateTime } from '../domain/booking.js'

const props = defineProps({
  customers: { type: Array, default: () => [] },
  professionals: { type: Array, default: () => [] },
  services: { type: Array, default: () => [] },
  timeZone: { type: String, default: 'America/Lima' },
  onCreate: { type: Function, required: true }
})

const open = ref(false)
const state = ref('idle')
const message = ref('Activa el micrófono para preparar una cita.')
const transcript = ref('')
const error = ref('')
const draft = ref(null)
let recognition = null
let chat = null
let bookingModel = null
let bookingDraft = {}
let active = false
let processing = false
let restartTimer

const busy = computed(() => ['connecting', 'processing', 'creating'].includes(state.value))
const status = computed(() => ({
  idle: 'Asistente de citas', connecting: 'Conectando…', listening: 'Escuchando…',
  processing: 'Entendiendo…', confirming: 'Confirma la reserva', creating: 'Registrando…',
  success: 'Cita registrada', error: 'No se pudo continuar'
}[state.value] || 'Asistente de citas'))

const normalize = value => String(value || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
const isConfirmation = value => /^(si|confirmo|confirma|correcto|de acuerdo|esta bien|ok|dale|guardar|guardalo)$/.test(normalize(value))
const isCancellation = value => /^(no|cancelar|cancela|olvidalo)$/.test(normalize(value))

function catalog(values) {
  return values.filter(item => item.active !== false).slice(0, 50).map(item => ({
    id: item.id, name: item.name, durationMinutes: item.durationMinutes, price: item.price
  }))
}

function instruction() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: props.timeZone }).format(new Date())
  return `Eres QUIRU, asistente de agenda para un negocio. Fecha actual: ${today}. Zona: ${props.timeZone}.
Habla en español breve y haz una sola pregunta por turno. No inventes IDs, disponibilidad ni precios.
Clientes autorizados: ${JSON.stringify(catalog(props.customers))}
Profesionales autorizados: ${JSON.stringify(catalog(props.professionals))}
Servicios autorizados: ${JSON.stringify(catalog(props.services))}
En cada turno debes llamar actualizar_borrador con todos los datos nuevos que hayas entendido, aunque falten otros.
Conserva los datos del borrador actual entregado por el sistema. Usa IDs exactos del catálogo; si no puedes resolver uno, envía su texto en el campo Query correspondiente.
Convierte fechas relativas a YYYY-MM-DD. La duración procede del servicio. No confirmes ni guardes directamente.`
}

const tools = [{ functionDeclarations: [{
  name: 'actualizar_borrador',
  description: 'Extrae y acumula los datos mencionados en este turno. Debe usarse en cada turno del usuario.',
  parameters: {
    type: 'object',
    properties: {
      customerId: { type: 'string' }, serviceId: { type: 'string' }, professionalId: { type: 'string' },
      customerQuery: { type: 'string' }, serviceQuery: { type: 'string' }, professionalQuery: { type: 'string' },
      date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:mm' },
      notes: { type: 'string' }
    }
  }
}]}]

const activeItems = values => values.filter(item => item.active !== false)
const findCatalogItem = (values, id, query) => {
  const items = activeItems(values)
  if (id) {
    const exact = items.find(item => item.id === id)
    if (exact) return exact
  }
  const wanted = normalize(query)
  if (!wanted) return null
  const matches = items.filter(item => {
    const name = normalize(item.name)
    return name === wanted || name.includes(wanted) || wanted.includes(name)
  })
  return matches.length === 1 ? matches[0] : null
}

function mergeBookingDraft(args = {}) {
  const customer = findCatalogItem(props.customers, args.customerId, args.customerQuery)
  const service = findCatalogItem(props.services, args.serviceId, args.serviceQuery)
  const professional = findCatalogItem(props.professionals, args.professionalId, args.professionalQuery)
  if (customer) bookingDraft.customerId = customer.id
  if (service) bookingDraft.serviceId = service.id
  if (professional) bookingDraft.professionalId = professional.id
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(args.date || ''))) bookingDraft.date = args.date
  if (/^\d{2}:\d{2}$/.test(String(args.time || ''))) bookingDraft.time = args.time
  if (args.notes) bookingDraft.notes = args.notes
  return bookingDraft
}

function missingField() {
  if (!bookingDraft.customerId) return 'customerId'
  if (!bookingDraft.serviceId) return 'serviceId'
  if (!bookingDraft.professionalId) return 'professionalId'
  if (!bookingDraft.date) return 'date'
  if (!bookingDraft.time) return 'time'
  return null
}

function missingQuestion(field) {
  return {
    customerId: '¿Para qué cliente es la cita?',
    serviceId: '¿Qué servicio desea reservar?',
    professionalId: '¿Con qué profesional desea atenderse?',
    date: '¿Para qué fecha desea la cita?',
    time: '¿A qué hora desea la cita?'
  }[field] || 'Dime los datos de la cita.'
}

function bookingContext(text) {
  const customer = props.customers.find(item => item.id === bookingDraft.customerId)?.name || ''
  const service = props.services.find(item => item.id === bookingDraft.serviceId)?.name || ''
  const professional = props.professionals.find(item => item.id === bookingDraft.professionalId)?.name || ''
  return `Borrador actual: cliente=${customer || 'falta'}; servicio=${service || 'falta'}; profesional=${professional || 'falta'}; fecha=${bookingDraft.date || 'falta'}; hora=${bookingDraft.time || 'falta'}. Nuevo mensaje: ${text}`
}

function mergeLocalText(text) {
  const value = normalize(text)
  const uniqueMention = values => {
    const matches = activeItems(values).filter(item => value.includes(normalize(item.name)))
    return matches.length === 1 ? matches[0] : null
  }
  const customer = uniqueMention(props.customers)
  const service = uniqueMention(props.services)
  const professional = uniqueMention(props.professionals)
  if (customer) bookingDraft.customerId = customer.id
  if (service) bookingDraft.serviceId = service.id
  if (professional) bookingDraft.professionalId = professional.id

  const isoDate = value.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1]
  const shortDate = value.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?\b/)
  const zonedToday = new Date(new Intl.DateTimeFormat('en-US', {
    timeZone: props.timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date()))
  if (isoDate) bookingDraft.date = isoDate
  else if (shortDate) {
    const year = shortDate[3] || zonedToday.getFullYear()
    bookingDraft.date = `${year}-${String(shortDate[2]).padStart(2, '0')}-${String(shortDate[1]).padStart(2, '0')}`
  } else if (/\bmanana\b/.test(value)) {
    zonedToday.setDate(zonedToday.getDate() + 1)
    bookingDraft.date = zonedToday.toISOString().slice(0, 10)
  } else if (/\bhoy\b/.test(value)) bookingDraft.date = zonedToday.toISOString().slice(0, 10)

  const timeMatch = value.match(/\b(?:a\s+las?|hora)?\s*(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b/) ||
    value.match(/\b(?:a\s+las?|hora)\s+(\d{1,2})\s*(am|pm)?\b/)
  if (timeMatch) {
    let hour = Number(timeMatch[1])
    const hasMinutes = timeMatch.length >= 4 && /^\d{2}$/.test(timeMatch[2] || '')
    const minute = hasMinutes ? Number(timeMatch[2]) : 0
    const meridiem = hasMinutes ? timeMatch[3] : timeMatch[2]
    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
    if (!meridiem && /\b(tarde|noche)\b/.test(value) && hour < 12) hour += 12
    if (hour <= 23 && minute <= 59) bookingDraft.time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }
}

function prepare(args) {
  const customer = props.customers.find(item => item.id === args.customerId && item.active !== false)
  const professional = props.professionals.find(item => item.id === args.professionalId && item.active !== false)
  const service = props.services.find(item => item.id === args.serviceId && item.active !== false)
  if (!customer || !professional || !service) throw new Error('No pude validar cliente, servicio o profesional.')
  const start = localDateTime(args.date, args.time)
  const durationMinutes = Number(service.durationMinutes || 30)
  const end = appointmentEnd(start, durationMinutes)
  const time = value => new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false }).format(value)
  draft.value = {
    customerId: customer.id, customerName: customer.name,
    professionalId: professional.id, professionalName: professional.name,
    serviceId: service.id, serviceName: service.name,
    date: args.date, time: args.time, durationMinutes, notes: args.notes || '', source: 'voice',
    summary: `${customer.name}, ${service.name} con ${professional.name}, ${args.date} de ${time(start)} a ${time(end)}`
  }
  state.value = 'confirming'
  return draft.value
}

function speechConstructor() { return window.SpeechRecognition || window.webkitSpeechRecognition }

function scheduleListening() {
  clearTimeout(restartTimer)
  if (!active || processing || state.value === 'creating') return
  restartTimer = setTimeout(startListening, 350)
}

function startListening() {
  if (!active || processing || !recognition) return
  try { recognition.start() } catch (cause) {
    if (String(cause?.message || '').toLowerCase().includes('already')) scheduleListening()
    else fail(cause)
  }
}

function makeRecognition() {
  const Recognition = speechConstructor()
  const instance = new Recognition()
  instance.lang = 'es-PE'
  instance.continuous = false
  instance.interimResults = true
  instance.onstart = () => { state.value = draft.value ? 'confirming' : 'listening' }
  instance.onresult = event => {
    let finalText = ''
    let interimText = ''
    for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
      const text = event.results[index]?.[0]?.transcript?.trim() || ''
      if (event.results[index].isFinal) finalText += `${text} `
      else interimText += `${text} `
    }
    if (interimText.trim()) transcript.value = interimText.trim()
    if (finalText.trim()) {
      transcript.value = finalText.trim()
      processTurn(finalText.trim())
    }
  }
  instance.onerror = event => {
    if (event.error === 'aborted') return
    if (event.error === 'no-speech') { processing = false; scheduleListening(); return }
    fail(new Error(event.error))
  }
  instance.onend = () => { if (active && !processing) scheduleListening() }
  return instance
}

async function speak(text) {
  message.value = text
  if (!text || !window.speechSynthesis) return
  await new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'es-PE'
    utterance.rate = 1.08
    let done = false
    const finish = () => { if (!done) { done = true; clearTimeout(timer); resolve() } }
    const timer = setTimeout(() => { window.speechSynthesis.cancel(); finish() }, Math.max(3500, text.length * 100))
    utterance.onend = finish
    utterance.onerror = finish
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  })
}

async function speakAndListen(text) {
  try { recognition?.abort() } catch (cause) {}
  await speak(text)
  processing = false
  scheduleListening()
}

async function confirmDraft() {
  if (!draft.value) return
  processing = true
  state.value = 'creating'
  try {
    await props.onCreate({ ...draft.value })
    state.value = 'success'
    active = false
    await speak('Listo. La cita quedó registrada.')
    stopRecognition()
  } catch (cause) {
    error.value = cause?.message || 'No se pudo registrar la cita.'
    state.value = 'confirming'
    processing = false
    await speakAndListen(error.value)
  }
}

async function processTurn(text) {
  if (!active || processing) return
  processing = true
  state.value = 'processing'
  try {
    if (draft.value && isConfirmation(text)) { await confirmDraft(); return }
    if (draft.value && isCancellation(text)) {
      draft.value = null
      bookingDraft = {}
      await speakAndListen('Reserva cancelada. Puedes indicarme una nueva cita.')
      return
    }
    mergeLocalText(text)
    if (!missingField()) {
      const prepared = prepare(bookingDraft)
      await speakAndListen(`${prepared.summary}. ¿Confirmas?`)
      return
    }
    const response = (await chat.sendMessage(bookingContext(text))).response
    const calls = response.functionCalls?.() || []
    if (calls[0]?.name === 'actualizar_borrador') {
      mergeBookingDraft(calls[0].args)
      // Reiniciamos el chat para no dejar una llamada de herramienta sin respuesta;
      // el borrador completo se vuelve a inyectar en el siguiente turno.
      chat = bookingModel.startChat()
      const missing = missingField()
      if (missing) await speakAndListen(missingQuestion(missing))
      else {
        const prepared = prepare(bookingDraft)
        await speakAndListen(`${prepared.summary}. ¿Confirmas?`)
      }
    } else {
      await speakAndListen(missingQuestion(missingField()))
    }
  } catch (cause) { fail(cause) }
}

async function start() {
  error.value = ''
  transcript.value = ''
  draft.value = null
  bookingDraft = {}
  if (!speechConstructor() || !navigator.mediaDevices?.getUserMedia || !appCheck) {
    fail(new Error('El navegador no admite voz o App Check no está configurado.'))
    return
  }
  state.value = 'connecting'
  try {
    await getAppCheckToken(appCheck)
    bookingModel = getGenerativeModel(getAI(app, { backend: new GoogleAIBackend() }), {
      model: import.meta.env.VITE_QUIRU_TEXT_MODEL || 'gemini-3.5-flash-lite',
      systemInstruction: instruction(), tools, generationConfig: { maxOutputTokens: 100, temperature: 0.1 }
    })
    chat = bookingModel.startChat()
    recognition = makeRecognition()
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => stream.getTracks().forEach(track => track.stop()))
    active = true
    processing = true
    await speakAndListen('Hola, soy QUIRU. Dime cliente, servicio, profesional, fecha y hora.')
  } catch (cause) { fail(cause) }
}

function fail(cause) {
  console.error(cause)
  error.value = cause?.message || 'El asistente de voz no está disponible.'
  state.value = 'error'
  processing = false
  active = false
  stopRecognition()
}

function stopRecognition() {
  clearTimeout(restartTimer)
  try { recognition?.abort() } catch (cause) {}
  recognition = null
  chat = null
  bookingModel = null
  window.speechSynthesis?.cancel()
}

function close() {
  active = false
  processing = false
  stopRecognition()
  open.value = false
  state.value = 'idle'
}

function show() { open.value = true; state.value = 'idle'; error.value = ''; draft.value = null; bookingDraft = {} }
onBeforeUnmount(close)
</script>

<template>
  <button class="button voice-button" type="button" @click="show">✦ Agendar con QUIRU</button>
  <Teleport to="body">
    <div v-if="open" class="voice-backdrop" @click="close"></div>
    <section v-if="open" class="voice-dialog" role="dialog" aria-modal="true" @click.stop>
      <header><div><p class="eyebrow">IA conversacional</p><h2>{{ status }}</h2></div><button class="close-button" type="button" @click="close">×</button></header>
      <div class="voice-body">
        <div class="voice-orb" :class="{ active: state === 'listening' || state === 'confirming' }">♫</div>
        <p>{{ message }}</p><small v-if="transcript" class="transcript">Entendí: {{ transcript }}</small>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <article v-if="draft" class="draft-card"><strong>{{ draft.customerName }}</strong><span>{{ draft.serviceName }} con {{ draft.professionalName }}</span><span>{{ draft.date }} · {{ draft.time }} · {{ draft.durationMinutes }} min</span></article>
      </div>
      <footer>
        <button class="button secondary" type="button" @click="close">Cerrar</button>
        <button v-if="state === 'idle' || state === 'error'" class="button primary" :disabled="busy" type="button" @click="start">Activar micrófono</button>
        <button v-if="state === 'confirming' && draft" class="button primary" :disabled="busy" type="button" @click="confirmDraft">Confirmar cita</button>
      </footer>
    </section>
  </Teleport>
</template>

<style scoped>
.voice-button { color: #071b40; background: linear-gradient(135deg, #00d4ff, #7d62ff); }
.voice-backdrop { position: fixed; inset: 0; z-index: 3000; background: rgba(7,27,64,.55); }
.voice-dialog { position: fixed; top: 50%; left: 50%; z-index: 3001; width: min(92vw, 560px); transform: translate(-50%,-50%); background: white; border-radius: 22px; box-shadow: 0 25px 80px rgba(7,27,64,.3); }
.voice-dialog header, .voice-dialog footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 22px; border-bottom: 1px solid #e2e8f0; }.voice-dialog footer { justify-content: flex-end; border-top: 1px solid #e2e8f0; border-bottom: 0; }
.voice-dialog h2 { margin: 4px 0 0; }.close-button { border: 0; background: transparent; font-size: 30px; cursor: pointer; }
.voice-body { display: grid; justify-items: center; gap: 12px; padding: 26px; text-align: center; }
.voice-orb { width: 72px; height: 72px; display: grid; place-items: center; border-radius: 50%; color: white; background: linear-gradient(135deg,#0066ff,#643bff); font-size: 28px; }.voice-orb.active { box-shadow: 0 0 0 12px rgba(0,212,255,.15); animation: pulse 1.4s infinite; }
.transcript { color: #52657f; }.draft-card { width: 100%; display: grid; gap: 5px; padding: 16px; text-align: left; background: #f3f7ff; border-radius: 14px; }.draft-card span { color: #52657f; }
@keyframes pulse { 50% { box-shadow: 0 0 0 20px rgba(0,212,255,0); } }
</style>
