<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { GoogleAIBackend, getAI, getGenerativeModel } from 'firebase/ai'
import { getToken as getAppCheckToken } from 'firebase/app-check'
import { app, appCheck } from '../../../../packages/platform/src/firebase.js'
import { detectLocalIntent } from '../domain/orderIntent.js'
import { parseCatalogIntent } from '../domain/conversationParser.js'
import { formatMoney } from '../domain/money.js'
import { normalizeText } from '../domain/text.js'

const props = defineProps({
  cart: { type: Object, required: true },
  menuRepository: { type: Object, required: true },
  engine: { type: Object, required: true },
  conversation: { type: Object, required: true },
  currency: { type: String, default: 'PEN' },
  locale: { type: String, default: 'es-PE' },
  lastLineId: { type: String, default: '' },
  confirmationPending: { type: Boolean, default: false },
  telemetry: { type: Object, required: true }
})
const emit = defineEmits(['cart-change', 'confirm-request', 'confirm-order', 'cancel', 'last-line'])

const state = ref('idle')
const message = ref('Activa el micrófono o escribe para hablar con QUIRU.')
const transcript = ref('')
const textInput = ref('')
const error = ref('')
const active = ref(false)
const metrics = ref({ turns: 0, aiCalls: 0, toolCalls: 0 })
let recognition = null
let model = null
let chat = null
let processing = false
let restartTimer = null
let inactivityTimer = null
let sessionTimer = null

const busy = computed(() => ['connecting', 'processing', 'speaking'].includes(state.value))
const statusLabel = computed(() => ({
  idle: 'QUIRU está listo', connecting: 'Conectando…', listening: 'Escuchando…',
  processing: 'Entendiendo…', speaking: 'QUIRU responde', error: 'Voz no disponible'
}[state.value] || 'QUIRU'))

const tools = [{ functionDeclarations: [{
  name: 'aplicar_intencion_pedido',
  description: 'Extrae una acción sobre el carrito. No calcula ni inventa precios o productos.',
  parameters: {
    type: 'object',
    required: ['intent'],
    properties: {
      intent: { type: 'string', enum: ['ADD_ITEMS', 'REMOVE_ITEM', 'UPDATE_ITEM', 'REPLACE_ITEM', 'CLEAR_CART', 'GET_TOTAL', 'LIST_PRODUCTS', 'CONFIRM_ORDER', 'CANCEL_ORDER', 'UNKNOWN'] },
      categoryQuery: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            productId: { type: 'string' }, productQuery: { type: 'string' },
            quantity: { type: 'integer' }, variant: { type: 'string' },
            extras: { type: 'array', items: { type: 'string' } },
            removeIngredients: { type: 'array', items: { type: 'string' } },
            targetLineId: { type: 'string' }
          }
        }
      }
    }
  }
}]}]

function speechConstructor() { return window.SpeechRecognition || window.webkitSpeechRecognition }
async function localCategoryResponse(text) {
  const normalized = normalizeText(text)
  const categories = await props.menuRepository.getCategories()
  const category = categories.find(item =>
    normalized.includes(normalizeText(item.name)) ||
    (item.id === 'drinks' && /\b(bebida|bebidas|tomar)\b/.test(normalized)))
  if (!category || !/(que|cuales|muestra|tienen|hay)/.test(normalized)) return null
  const products = (await props.menuRepository.getCategoryProducts(category.id)).filter(item => item.available)
  return products.length ? `${category.name}: ${products.map(item => item.name).join(', ')}.` : `No hay ${category.name.toLowerCase()} disponibles por el momento.`
}

async function relevantCatalog(text) {
  const direct = await props.menuRepository.searchProducts(text, { limit: 8 })
  if (direct.length) return direct
  const normalized = normalizeText(text)
  const categories = await props.menuRepository.getCategories()
  const category = categories.find(item => normalized.includes(normalizeText(item.name)))
  return category ? (await props.menuRepository.getCategoryProducts(category.id)).slice(0, 8) : []
}

function systemInstruction() {
  return `Eres QUIRU, asistente breve de un restaurante. Interpreta español peruano.
Siempre llama aplicar_intencion_pedido. Nunca calcules precios, totales, descuentos o disponibilidad.
Nunca inventes productos, modificadores, ingredientes ni información de alérgenos.
Usa exclusivamente el catálogo relevante entregado en cada turno y los IDs del carrito.
Si hay ambigüedad usa UNKNOWN. Mantén referencias cortas al último producto del carrito.`
}

function cartContext() {
  return props.cart.items.map(item => ({
    lineId: item.id, productId: item.productId, name: item.name, quantity: item.quantity,
    modifiers: item.modifiers.map(modifier => modifier.name), removed: item.removeIngredients.map(ingredient => ingredient.name)
  }))
}

async function ensureAI() {
  if (chat) return
  if (!appCheck) throw new Error('App Check no está configurado para usar IA.')
  await getAppCheckToken(appCheck)
  model = getGenerativeModel(getAI(app, { backend: new GoogleAIBackend() }), {
    model: import.meta.env.VITE_QUIRU_TEXT_MODEL || 'gemini-3.5-flash-lite',
    systemInstruction: systemInstruction(), tools,
    generationConfig: { maxOutputTokens: 120, temperature: 0.1 }
  })
  chat = model.startChat()
}

async function interpretWithAI(text) {
  await ensureAI()
  const catalog = (await relevantCatalog(text)).map(product => ({
    id: product.id, name: product.name, aliases: product.aliases || [], available: product.available,
    ingredients: (product.ingredients || []).filter(item => item.removable).map(item => item.name),
    modifiers: (product.modifierGroups || []).flatMap(group => group.options.map(option => option.name))
  }))
  metrics.value.aiCalls += 1
  const response = (await chat.sendMessage(`Catálogo relevante: ${JSON.stringify(catalog)}\nCarrito: ${JSON.stringify(cartContext())}\nÚltima línea: ${props.lastLineId || 'ninguna'}\nCliente: ${text}`)).response
  const call = response.functionCalls?.()?.[0]
  chat = model.startChat()
  if (!call || call.name !== 'aplicar_intencion_pedido') throw new Error('QUIRU no pudo estructurar esa solicitud.')
  metrics.value.toolCalls += 1
  return call.args
}

async function applyIntent(intent) {
  if (intent.intent === 'CONFIRM_ORDER') {
    if (!props.cart.items.length) return 'Tu pedido está vacío.'
    if (props.confirmationPending) {
      emit('confirm-order')
      return 'Estoy registrando tu pedido.'
    }
    emit('confirm-request')
    return `Tu pedido está listo. El total es ${formatMoney(props.cart.total, props.currency, props.locale)}. ¿Deseas confirmarlo?`
  }
  if (intent.intent === 'GET_TOTAL') return `Llevas ${formatMoney(props.cart.total, props.currency, props.locale)}.`
  if (intent.intent === 'LIST_PRODUCTS') return (await localCategoryResponse(intent.categoryQuery || '')) || 'Puedo mostrarte las categorías disponibles.'
  if (intent.intent === 'CANCEL_ORDER') {
    const result = await props.engine.applyIntent(props.cart, intent, { lastLineId: props.lastLineId })
    emit('cart-change', result.cart); emit('cancel'); stopSession('cancelled')
    return 'Pedido cancelado.'
  }
  const result = await props.engine.applyIntent(props.cart, intent, { lastLineId: props.lastLineId })
  if (!result.ok) return result.message
  emit('cart-change', result.cart)
  const last = result.lines?.at(-1) || result.line
  if (last) emit('last-line', last.id)
  if (intent.intent === 'CLEAR_CART') return 'Listo. Vacié el pedido.'
  if (intent.intent === 'REMOVE_ITEM') return 'Listo. Quité el producto.'
  if (intent.intent === 'UPDATE_ITEM') return `Listo. Actualicé ${last?.name || 'el producto'}.`
  if (intent.intent === 'ADD_ITEMS') return `Listo. Agregué ${result.lines.map(item => item.name).join(' y ')}. ¿Algo más?`
  return 'Listo.'
}

async function processTurn(text, source = 'manual') {
  const clean = text.trim()
  if (!clean || processing) return
  processing = true; state.value = 'processing'; error.value = ''; transcript.value = clean
  metrics.value.turns += 1; props.telemetry.track('voice_turn', { source })
  resetInactivityTimer()
  try {
    const categoryReply = await localCategoryResponse(clean)
    let reply
    if (categoryReply) reply = categoryReply
    else {
      const products = await props.menuRepository.getAllProducts()
      const intent = detectLocalIntent(clean) || parseCatalogIntent(clean, products, props.cart) || await interpretWithAI(clean)
      reply = await applyIntent(intent)
    }
    await respond(reply, source === 'voice')
  } catch (cause) {
    console.error(cause)
    error.value = 'El asistente de voz no está disponible temporalmente. Puedes continuar con el menú.'
    props.telemetry.track('ai_error', { reason: cause?.code || 'assistant-error' })
    state.value = 'error'; active.value = false; stopRecognition()
  } finally { processing = false }
}

async function speak(text) {
  message.value = text
  if (!active.value || !window.speechSynthesis) return
  state.value = 'speaking'
  await new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = props.conversation.language || 'es-PE'; utterance.rate = 1.08
    const timeout = setTimeout(() => { window.speechSynthesis.cancel(); resolve() }, Math.max(3500, text.length * 90))
    utterance.onend = () => { clearTimeout(timeout); resolve() }
    utterance.onerror = () => { clearTimeout(timeout); resolve() }
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance)
  })
}

async function respond(text, continueListening) {
  try { recognition?.abort() } catch (cause) {}
  await speak(text)
  if (continueListening && active.value) scheduleListening()
  else state.value = active.value ? 'listening' : 'idle'
}

function makeRecognition() {
  const Recognition = speechConstructor()
  const instance = new Recognition()
  instance.lang = props.conversation.language || 'es-PE'; instance.continuous = false; instance.interimResults = true
  instance.onstart = () => { state.value = 'listening' }
  instance.onresult = event => {
    let finalText = ''; let interimText = ''
    for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
      const value = event.results[index]?.[0]?.transcript?.trim() || ''
      if (event.results[index].isFinal) finalText += `${value} `; else interimText += `${value} `
    }
    if (interimText.trim()) transcript.value = interimText.trim()
    if (finalText.trim()) processTurn(finalText.trim(), 'voice')
  }
  instance.onerror = event => {
    if (['aborted', 'no-speech'].includes(event.error)) { if (event.error === 'no-speech') scheduleListening(); return }
    error.value = 'No pude acceder al micrófono. Puedes continuar manualmente.'; state.value = 'error'; active.value = false
  }
  instance.onend = () => { if (active.value && !processing && state.value !== 'speaking') scheduleListening() }
  return instance
}

function scheduleListening() {
  clearTimeout(restartTimer)
  if (!active.value || processing) return
  restartTimer = setTimeout(() => { try { recognition?.start() } catch (cause) {} }, 350)
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimer)
  if (!active.value) return
  inactivityTimer = setTimeout(() => stopSession('inactivity'), Number(props.conversation.inactivityTimeoutSeconds || 90) * 1000)
}

async function startVoice() {
  error.value = ''; state.value = 'connecting'
  if (!speechConstructor() || !navigator.mediaDevices?.getUserMedia) {
    error.value = 'Este navegador no admite el micrófono. Puedes continuar manualmente.'; state.value = 'error'; return
  }
  try {
    await ensureAI()
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => stream.getTracks().forEach(track => track.stop()))
    recognition = makeRecognition(); active.value = true
    metrics.value = { turns: 0, aiCalls: 0, toolCalls: 0 }
    props.telemetry.track('serve_session_started', { mode: 'voice' }); props.telemetry.track('voice_started', { source: 'microphone' })
    clearTimeout(sessionTimer)
    sessionTimer = setTimeout(() => stopSession('max-duration'), Number(props.conversation.maxSessionMinutes || 10) * 60000)
    resetInactivityTimer()
    await respond(props.conversation.welcomeMessage, true)
  } catch (cause) {
    console.error(cause); error.value = 'El asistente de voz no está disponible temporalmente. Puedes continuar con el menú.'; state.value = 'error'
  }
}

function stopRecognition() {
  clearTimeout(restartTimer); clearTimeout(inactivityTimer); clearTimeout(sessionTimer)
  try { recognition?.abort() } catch (cause) {}
  recognition = null; window.speechSynthesis?.cancel()
}

function stopSession(reason = 'manual') {
  if (active.value) props.telemetry.track('serve_session_ended', { reason, ...props.telemetry.summary(metrics.value) })
  active.value = false; processing = false; stopRecognition(); chat = null; model = null; state.value = 'idle'
}

function submitText() {
  const value = textInput.value; textInput.value = ''; processTurn(value, 'manual')
}

async function announce(text, stopAfter = false) {
  await respond(text, active.value && !stopAfter)
  if (stopAfter) stopSession('order-complete')
}

defineExpose({ stopSession, announce })
onBeforeUnmount(() => stopSession('unmount'))
</script>

<template>
  <section class="quiru-assistant" :data-state="state">
    <div class="assistant-orb" :class="{ active: active && state === 'listening' }"><span>🎙️</span></div>
    <div class="assistant-copy">
      <strong>{{ statusLabel }}</strong>
      <p>{{ message }}</p>
      <small v-if="transcript">Entendí: {{ transcript }}</small>
      <small v-if="error" class="assistant-error">{{ error }}</small>
    </div>
    <div class="assistant-actions">
      <form class="assistant-text" @submit.prevent="submitText">
        <input v-model="textInput" :disabled="busy" aria-label="Escribe tu pedido" placeholder="Escribe: Quiero una hamburguesa…">
        <button type="submit" :disabled="busy || !textInput.trim()">Enviar</button>
      </form>
      <button v-if="!active" class="talk-button" type="button" :disabled="busy" @click="startVoice">🎙️ Háblale a QUIRU</button>
      <button v-else class="stop-button" type="button" @click="stopSession('manual')">Detener voz</button>
    </div>
  </section>
</template>
