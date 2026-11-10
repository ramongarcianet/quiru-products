<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import restaurantConfig from './config/restaurant.json'
import menuConfig from './config/menu.json'
import conversationConfig from './config/conversation.json'
import uiConfig from './config/ui.json'
import runtimeConfig from './config/runtime.json'
import QuiruAssistant from './src/components/QuiruAssistant.vue'
import { JsonServeRepository, RuntimeServeRepository } from './src/repositories/jsonRepositories.js'
import { FirebaseServeRepository } from './src/repositories/firebaseServeRepository.js'
import { OrderRulesEngine } from './src/domain/orderRulesEngine.js'
import { formatMoney } from './src/domain/money.js'
import { ServeTelemetry } from './src/services/telemetry.js'
import { functions } from '../../packages/platform/src/firebase.js'
import AuthGate from '../../packages/platform/src/components/AuthGate.vue'
import { MODULE_IDS } from '../../packages/platform/src/modules.js'
import ServeAdministration from '../administration/src/components/ServeAdministration.vue'
import ServeDashboard from './src/components/ServeDashboard.vue'

const portalUrl = import.meta.env.VITE_PORTAL_URL || (import.meta.env.DEV ? `http://${window.location.hostname}:4170/` : '')
const query = new URLSearchParams(window.location.search)
const managementMode = window.location.pathname.replace(/\/+$/, '') === '/manage' || query.get('mode') === 'manage'
const managementView = ref('dashboard')
const requestedRestaurantId = String(query.get('restaurant') || runtimeConfig.restaurantId).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60)
const ui = reactive({ ...uiConfig })
const fallbackRepository = new JsonServeRepository(restaurantConfig, menuConfig, conversationConfig)
const remoteRepository = new FirebaseServeRepository(functions, requestedRestaurantId)
const menuRepository = new RuntimeServeRepository(remoteRepository)
const engine = new OrderRulesEngine(menuRepository)
const telemetry = new ServeTelemetry(uiConfig.telemetryEnabled)
const restaurant = reactive({ id: '', name: '', branding: {}, contact: {}, businessHours: '', currency: 'PEN', locale: 'es-PE', orderingMode: 'TABLE' })
const conversation = reactive({ assistantName: 'QUIRU', language: 'es-PE', welcomeMessage: '' })
const categories = ref([])
const products = ref([])
const upsellRules = ref([])
const selectedCategory = ref(ui.defaultCategory || '')
const cartOpen = ref(false)
const editorProduct = ref(null)
const editorQuantity = ref(1)
const editorSelections = reactive({})
const editorRemovals = ref([])
const editorError = ref('')
const notice = ref('')
const lastLineId = ref('')
const confirmationOpen = ref(false)
const confirmedOrder = ref(null)
const backendReady = ref(false)
const loadingCatalog = ref(true)
const submittingOrder = ref(false)
const assistant = ref(null)
let statusTimer = null
const table = String(query.get('table') || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12)

function restoreCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(ui.cartStorageKey) || 'null')
    if (stored?.items && Array.isArray(stored.items)) return engine.pricedCart(stored.items)
  } catch (cause) {
    console.debug('No se pudo recuperar el carrito', cause)
  }
  return engine.emptyCart()
}
const cart = ref(restoreCart())

watch(cart, value => {
  try { localStorage.setItem(ui.cartStorageKey, JSON.stringify(value)) } catch (cause) {}
}, { deep: true })

const visibleProducts = computed(() => products.value.filter(product => product.categoryId === selectedCategory.value))
const selectedCategoryName = computed(() => categories.value.find(item => item.id === selectedCategory.value)?.name || 'Menú')
const cartCount = computed(() => cart.value.items.reduce((total, item) => total + item.quantity, 0))
const orderStatusLabel = computed(() => ({
  RECEIVED: 'Recibido', PREPARING: 'En preparación', READY: 'Listo', DELIVERED: 'Entregado', CANCELLED: 'Cancelado'
}[confirmedOrder.value?.status] || confirmedOrder.value?.status || 'Recibido'))
const upsell = computed(() => {
  if (!cart.value.items.length) return null
  const productIds = new Set(cart.value.items.map(item => item.productId))
  const rule = upsellRules.value.find(item => productIds.has(item.triggerProductId) && !productIds.has(item.suggestProductId))
  return rule ? products.value.find(product => product.id === rule.suggestProductId && product.available) : null
})

const money = value => formatMoney(value, restaurant.currency, restaurant.locale)
const productPriceFrom = product => {
  const minimumDelta = (product.modifierGroups || []).reduce((sum, group) => {
    const required = group.required ? (group.options || []).filter(option => option.available !== false).map(option => option.priceDelta || 0) : [0]
    return sum + Math.min(...required, 0)
  }, 0)
  return money(product.price + minimumDelta)
}

function chooseCategory(id) { selectedCategory.value = id }

function openEditor(product) {
  if (!product.available) return
  editorProduct.value = product; editorQuantity.value = 1; editorRemovals.value = []; editorError.value = ''
  Object.keys(editorSelections).forEach(key => delete editorSelections[key])
  for (const group of product.modifierGroups || []) {
    const selected = (group.options || []).filter(option => option.default).map(option => option.id)
    editorSelections[group.id] = group.type === 'single' ? (selected[0] || '') : selected
  }
}

function optionSelected(group, optionId) {
  return group.type === 'single' ? editorSelections[group.id] === optionId : (editorSelections[group.id] || []).includes(optionId)
}

function toggleOption(group, optionId) {
  if (group.type === 'single') { editorSelections[group.id] = optionId; return }
  const current = [...(editorSelections[group.id] || [])]
  const index = current.indexOf(optionId)
  if (index >= 0) current.splice(index, 1)
  else if (!group.maxSelections || current.length < group.maxSelections) current.push(optionId)
  editorSelections[group.id] = current
}

async function addEditedProduct() {
  const product = editorProduct.value
  if (!product) return
  const selectedNames = []
  let variant = ''
  for (const group of product.modifierGroups || []) {
    const ids = group.type === 'single' ? [editorSelections[group.id]].filter(Boolean) : (editorSelections[group.id] || [])
    const options = ids.map(id => group.options.find(option => option.id === id)).filter(Boolean)
    if (group.required && !options.length) { editorError.value = `Selecciona ${group.name}.`; return }
    if (group.type === 'single') variant = options[0]?.name || variant
    else selectedNames.push(...options.map(option => option.name))
  }
  const removeIngredients = (product.ingredients || []).filter(item => editorRemovals.value.includes(item.id)).map(item => item.name)
  const result = await engine.addItems(cart.value, [{ productId: product.id, quantity: editorQuantity.value, variant, extras: selectedNames, removeIngredients }])
  if (!result.ok) { editorError.value = result.message; return }
  cart.value = result.cart; lastLineId.value = result.lines.at(-1)?.id || lastLineId.value; editorProduct.value = null
  notice.value = `${product.name} agregado.`; telemetry.track('product_added', { source: 'manual', itemCount: editorQuantity.value })
}

function setCart(nextCart) { cart.value = nextCart }

async function changeQuantity(line, delta) {
  const quantity = line.quantity + delta
  if (quantity <= 0) { removeLine(line); return }
  const result = await engine.updateItem(cart.value, { targetLineId: line.id, quantity })
  if (result.ok) { cart.value = result.cart; lastLineId.value = line.id; telemetry.track('product_modified', { source: 'manual' }) }
}

function removeLine(line) {
  const result = engine.removeItem(cart.value, line.id)
  if (result.ok) { cart.value = result.cart; telemetry.track('product_removed', { source: 'manual' }) }
}

async function quickAdd(product) {
  openEditor(product)
  if ((product.modifierGroups || []).length || (product.ingredients || []).some(item => item.removable)) return
  await addEditedProduct()
}

function requestConfirmation() {
  if (!cart.value.items.length) { notice.value = 'Agrega al menos un producto.'; return }
  confirmationOpen.value = true
}

async function confirmOrder(source = 'manual') {
  if (submittingOrder.value) return
  if (!backendReady.value) {
    notice.value = 'El servicio de pedidos no está disponible. Tu pedido no fue enviado.'
    await assistant.value?.announce(notice.value)
    return
  }
  submittingOrder.value = true
  try {
    const result = await remoteRepository.createOrder(cart.value, { table, source })
    confirmedOrder.value = { ...result, table, currency: restaurant.currency }
    telemetry.track('order_confirmed', { source, itemCount: cartCount.value, total: cart.value.total })
    await assistant.value?.announce(`Pedido recibido. Tu referencia es ${result.id}.`, true)
    confirmationOpen.value = false; cartOpen.value = false
    cart.value = engine.emptyCart(); lastLineId.value = ''
    startStatusPolling()
  } catch (cause) {
    console.error(cause)
    notice.value = `No se pudo enviar el pedido. ${cause?.message || 'Inténtalo nuevamente.'}`
    await assistant.value?.announce('No pude registrar el pedido. Conservé tu carrito para que vuelvas a intentarlo.')
  } finally { submittingOrder.value = false }
}

function startStatusPolling() {
  clearInterval(statusTimer)
  if (!confirmedOrder.value?.id) return
  statusTimer = setInterval(async () => {
    try {
      const status = await remoteRepository.getOrderStatus(confirmedOrder.value.id, confirmedOrder.value.publicToken)
      confirmedOrder.value = { ...confirmedOrder.value, ...status }
      if (['DELIVERED', 'CANCELLED'].includes(status.status)) clearInterval(statusTimer)
    } catch (cause) { console.debug('No se pudo actualizar el estado del pedido.', cause) }
  }, 10000)
}

function cancelOrder() {
  cart.value = engine.emptyCart(); confirmationOpen.value = false; lastLineId.value = ''
  telemetry.track('order_cancelled', { source: 'manual' })
}

function addUpsell() { if (upsell.value) quickAdd(upsell.value) }

onMounted(async () => {
  if (managementMode) { loadingCatalog.value = false; return }
  try {
    await remoteRepository.loadCatalog()
    backendReady.value = true
  } catch (cause) {
    console.error('Catálogo remoto no disponible.', cause)
    if (import.meta.env.DEV) {
      menuRepository.use(fallbackRepository)
      notice.value = 'Catálogo local de desarrollo. Los pedidos no se enviarán hasta configurar el backend.'
    } else notice.value = 'El restaurante no está disponible temporalmente.'
  }
  try {
    Object.assign(restaurant, await menuRepository.getRestaurant())
    Object.assign(ui, restaurant.ui || {})
    Object.assign(conversation, await menuRepository.getConfig())
    categories.value = await menuRepository.getCategories()
    products.value = await menuRepository.getAllProducts()
    upsellRules.value = await menuRepository.getUpsellRules()
    if (!categories.value.some(item => item.id === selectedCategory.value)) selectedCategory.value = categories.value[0]?.id || ''
    telemetry.track('serve_session_started', { mode: restaurant.orderingMode })
  } finally { loadingCatalog.value = false }
})

onBeforeUnmount(() => clearInterval(statusTimer))
</script>

<template>
  <AuthGate v-if="managementMode" v-slot="{ logout, user }" :portal-url="portalUrl" :required-module="MODULE_IDS.SERVE_AI">
    <div class="serve-management-shell">
      <header class="serve-header"><div class="serve-brand"><span class="serve-mark">Q</span><div><strong>QUIRU Serve AI</strong><small>Gestión del restaurante</small></div></div><div class="restaurant-heading"><strong>Panel del restaurante</strong><span>{{ user.email }}</span></div><div class="header-badges"><a v-if="portalUrl" class="management-link" :href="portalUrl">Productos</a><button class="management-link" type="button" @click="logout">Salir</button></div></header>
      <nav class="serve-management-nav" aria-label="Navegación de Serve AI"><button type="button" :class="{ active: managementView === 'dashboard' }" @click="managementView = 'dashboard'">Dashboard</button><button type="button" :class="{ active: managementView === 'catalog' }" @click="managementView = 'catalog'">Carta y operación</button></nav>
      <main class="serve-management-content"><ServeDashboard v-if="managementView === 'dashboard'" @configure="managementView = 'catalog'" /><ServeAdministration v-else managed /></main>
    </div>
  </AuthGate>
  <div v-else class="serve-app" :style="{ '--restaurant-primary': restaurant.branding.primaryColor, '--restaurant-accent': restaurant.branding.accentColor }">
    <header class="serve-header">
      <div class="serve-brand">
        <span class="serve-mark">Q</span>
        <div><strong>QUIRU Serve AI</strong><small>Powered by QUIRU Labs</small></div>
      </div>
      <div class="restaurant-heading">
        <strong>{{ restaurant.name }}</strong>
        <span>{{ ui.tagline }}</span>
      </div>
      <div class="header-badges">
        <span class="demo-badge" :class="{ connected: backendReady }">{{ backendReady ? 'Servicio conectado' : (loadingCatalog ? 'Conectando…' : 'Servicio no disponible') }}</span>
        <span v-if="restaurant.orderingMode === 'TABLE'" class="table-badge">{{ table ? `Mesa ${table}` : 'Modo mesa' }}</span>
        <span v-else class="table-badge">Pedido online</span>
      </div>
    </header>

    <main class="ordering-layout">
      <aside class="categories-panel" aria-label="Categorías del menú">
        <p class="panel-kicker">Explora</p><h2>Categorías</h2>
        <nav>
          <button v-for="category in categories" :key="category.id" type="button" :class="{ active: selectedCategory === category.id }" @click="chooseCategory(category.id)">
            {{ category.name }}
          </button>
        </nav>
      </aside>

      <section class="menu-panel">
        <div class="section-title"><div><p class="panel-kicker">Nuestro menú</p><h1>{{ selectedCategoryName }}</h1></div><div class="establishment-details"><p>{{ restaurant.description }}</p><small v-if="restaurant.contact?.address">📍 {{ restaurant.contact.address }}</small><small v-if="restaurant.contact?.phone">Tel. {{ restaurant.contact.phone }}</small><small v-if="restaurant.businessHours">Horario: {{ restaurant.businessHours }}</small></div></div>
        <p v-if="notice" class="serve-notice" role="status">{{ notice }}</p>
        <div class="product-grid">
          <article v-for="product in visibleProducts" :key="product.id" class="menu-product" :class="{ unavailable: !product.available }">
            <div class="product-visual"><span>{{ product.categoryId === 'drinks' ? '🥤' : product.categoryId === 'desserts' ? '🍰' : product.categoryId === 'starters' ? '🧀' : '🍽️' }}</span></div>
            <div class="product-copy">
              <div class="product-title"><h3>{{ product.name }}</h3><strong>{{ productPriceFrom(product) }}</strong></div>
              <p>{{ product.description }}</p>
              <small v-if="ui.showAllergens && product.allergens?.length">Alérgenos declarados: {{ product.allergens.join(', ') }}</small>
              <small v-else-if="ui.showAllergens">Sin alérgenos declarados. Consulta al personal si necesitas confirmación.</small>
              <button type="button" :disabled="!product.available" @click="quickAdd(product)">{{ product.available ? ((product.modifierGroups?.length || product.ingredients?.some(item => item.removable)) ? 'Elegir opciones' : 'Agregar') : 'No disponible' }}</button>
            </div>
          </article>
        </div>
      </section>

      <aside class="cart-panel" :class="{ open: cartOpen }">
        <div class="cart-heading"><div><p class="panel-kicker">Tu pedido</p><h2>{{ cartCount }} {{ cartCount === 1 ? 'producto' : 'productos' }}</h2></div><button class="mobile-close" type="button" @click="cartOpen = false">×</button></div>
        <div v-if="!cart.items.length" class="empty-cart"><span>🛒</span><strong>Tu carrito está vacío</strong><p>Agrega productos o háblale a QUIRU.</p></div>
        <div v-else class="cart-lines">
          <article v-for="line in cart.items" :key="line.id" class="cart-line">
            <div><strong>{{ line.name }}</strong><small v-if="line.modifiers.length">{{ line.modifiers.map(item => item.name).join(', ') }}</small><small v-if="line.removeIngredients.length">Sin {{ line.removeIngredients.map(item => item.name).join(', ') }}</small></div>
            <div class="line-controls"><button type="button" @click="changeQuantity(line, -1)">−</button><span>{{ line.quantity }}</span><button type="button" @click="changeQuantity(line, 1)">+</button><strong>{{ money(line.unitPrice * line.quantity) }}</strong><button class="remove-line" type="button" aria-label="Quitar producto" @click="removeLine(line)">×</button></div>
          </article>
        </div>
        <button v-if="upsell && conversation.maxUpsellsPerOrder > 0" class="upsell-card" type="button" @click="addUpsell"><span>Puede acompañarte</span><strong>Agregar {{ upsell.name }} · {{ money(upsell.price) }}</strong></button>
        <div class="cart-total"><span>Total</span><strong>{{ money(cart.total) }}</strong></div>
        <button class="confirm-button" type="button" :disabled="!cart.items.length" @click="requestConfirmation">Revisar y confirmar</button>
      </aside>
    </main>

    <div class="assistant-dock">
      <QuiruAssistant v-if="conversation.voiceEnabled !== false" ref="assistant" :cart="cart" :menu-repository="menuRepository" :engine="engine" :conversation="conversation" :currency="restaurant.currency" :locale="restaurant.locale" :last-line-id="lastLineId" :confirmation-pending="confirmationOpen" :telemetry="telemetry" @cart-change="setCart" @last-line="lastLineId = $event" @confirm-request="requestConfirmation" @confirm-order="confirmOrder('voice')" @cancel="confirmationOpen = false" />
    </div>
    <button class="mobile-cart-button" type="button" @click="cartOpen = true">🛒 Ver pedido <span>{{ cartCount }}</span></button>
    <div v-if="cartOpen" class="mobile-backdrop" @click="cartOpen = false"></div>

    <Teleport to="body">
      <div v-if="editorProduct" class="modal-backdrop" @click="editorProduct = null"></div>
      <section v-if="editorProduct" class="serve-modal" role="dialog" aria-modal="true" :aria-label="`Personalizar ${editorProduct.name}`">
        <header><div><p class="panel-kicker">Personaliza</p><h2>{{ editorProduct.name }}</h2></div><button type="button" @click="editorProduct = null">×</button></header>
        <div class="modal-body">
          <fieldset v-for="group in editorProduct.modifierGroups || []" :key="group.id"><legend>{{ group.name }} <small v-if="group.required">Obligatorio</small></legend><label v-for="option in group.options" :key="option.id" :class="{ disabled: !option.available }"><input :type="group.type === 'single' ? 'radio' : 'checkbox'" :name="group.id" :checked="optionSelected(group, option.id)" :disabled="!option.available" @change="toggleOption(group, option.id)"><span>{{ option.name }}</span><strong v-if="option.priceDelta">+ {{ money(option.priceDelta) }}</strong></label></fieldset>
          <fieldset v-if="editorProduct.ingredients?.some(item => item.removable)"><legend>Quitar ingredientes</legend><label v-for="ingredient in editorProduct.ingredients.filter(item => item.removable)" :key="ingredient.id"><input v-model="editorRemovals" type="checkbox" :value="ingredient.id"><span>Sin {{ ingredient.name }}</span></label></fieldset>
          <label class="quantity-editor">Cantidad <span><button type="button" @click="editorQuantity = Math.max(1, editorQuantity - 1)">−</button><strong>{{ editorQuantity }}</strong><button type="button" @click="editorQuantity = Math.min(20, editorQuantity + 1)">+</button></span></label>
          <p v-if="editorError" class="modal-error">{{ editorError }}</p>
        </div>
        <footer><button class="secondary-action" type="button" @click="editorProduct = null">Cancelar</button><button class="primary-action" type="button" @click="addEditedProduct">Agregar al pedido</button></footer>
      </section>

      <div v-if="confirmationOpen" class="modal-backdrop" @click="confirmationOpen = false"></div>
      <section v-if="confirmationOpen" class="serve-modal confirmation-modal" role="dialog" aria-modal="true" aria-label="Confirmar pedido">
        <header><div><p class="panel-kicker">Confirmación final</p><h2>Revisa tu pedido</h2></div><button type="button" @click="confirmationOpen = false">×</button></header>
        <div class="modal-body"><article v-for="line in cart.items" :key="line.id" class="confirmation-line"><div><strong>{{ line.quantity }} × {{ line.name }}</strong><small>{{ [...line.modifiers.map(item => item.name), ...line.removeIngredients.map(item => `Sin ${item.name}`)].join(' · ') }}</small></div><strong>{{ money(line.unitPrice * line.quantity) }}</strong></article><div class="confirmation-total"><span>Total</span><strong>{{ money(cart.total) }}</strong></div><p v-if="!backendReady" class="demo-warning">El servicio no está conectado; el pedido no podrá enviarse.</p></div>
        <footer><button class="secondary-action" type="button" :disabled="submittingOrder" @click="confirmationOpen = false">Modificar</button><button class="danger-action" type="button" :disabled="submittingOrder" @click="cancelOrder">Cancelar pedido</button><button class="primary-action" type="button" :disabled="submittingOrder || !backendReady" @click="confirmOrder('manual')">{{ submittingOrder ? 'Enviando…' : 'Confirmar pedido' }}</button></footer>
      </section>

      <div v-if="confirmedOrder" class="modal-backdrop"></div>
      <section v-if="confirmedOrder" class="serve-modal success-modal" role="dialog" aria-modal="true" aria-label="Pedido confirmado">
        <div class="success-icon">✓</div><h2>Pedido recibido</h2><p>Referencia: {{ confirmedOrder.id }}</p><p v-if="confirmedOrder.table">Mesa {{ confirmedOrder.table }}</p><strong>{{ money(confirmedOrder.total) }}</strong><small>Estado: {{ orderStatusLabel }}</small><button class="primary-action" type="button" @click="confirmedOrder = null">Volver al menú</button>
      </section>
    </Teleport>
  </div>
</template>
