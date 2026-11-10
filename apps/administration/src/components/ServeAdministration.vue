<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../../packages/platform/src/firebase.js'
import seedRestaurant from '../../../serve-ai/config/restaurant.json'
import seedMenu from '../../../serve-ai/config/menu.json'
import seedConversation from '../../../serve-ai/config/conversation.json'
import seedUi from '../../../serve-ai/config/ui.json'

const props = defineProps({ managed: { type: Boolean, default: false } })

const exampleCategories = [
  { id: 'entradas', name: 'Entradas', order: 1 },
  { id: 'platos-principales', name: 'Platos principales', order: 2 },
  { id: 'bebidas', name: 'Bebidas', order: 3 }
]
const exampleUpsellRules = [
  { triggerProductId: 'hamburguesa-clasica', suggestProductId: 'papas-fritas' },
  { triggerProductId: 'lomo-saltado', suggestProductId: 'limonada' }
]
const jsonExample = value => JSON.stringify(value, null, 2)
const parseArrayField = (value, label) => {
  const parsed = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new Error(`${label} debe ser una lista JSON que empiece con [ y termine con ].`)
  return parsed
}
const plainData = value => JSON.parse(JSON.stringify(value))

const view = ref('catalog')
const restaurants = ref([])
const selectedId = ref('')
const products = ref([])
const orders = ref([])
const loading = ref(false)
const saving = ref(false)
const message = ref('')
const error = ref('')
const restaurantForm = ref(null)
const excelPreview = ref(null)
const excelWorking = ref(false)
const excelImporting = ref(false)
let refreshTimer = null

const blankRestaurant = () => ({ id: '', name: '', description: '', currency: 'PEN', locale: 'es-PE', timezone: 'America/Lima', orderingMode: 'TABLE', active: true, contact: { address: '', phone: '', whatsapp: '' }, businessHours: '', branding: { primaryColor: '#063f67', accentColor: '#00c7d9', logo: '' }, conversation: { assistantName: 'QUIRU', language: 'es-PE', welcomeMessage: 'Hola. ¿Qué te gustaría pedir?', maxSessionMinutes: 10, inactivityTimeoutSeconds: 90, maxUpsellsPerOrder: 1, voiceEnabled: true }, ui: { tagline: 'Habla. Pide. Disfruta.', showAllergens: true, defaultCategory: '' }, categories: [], upsellRules: [] })
const blankProduct = () => ({ id: '', restaurantId: '', categoryId: '', name: '', description: '', price: 0, available: true, aliases: [], allergens: [], ingredients: [], modifierGroups: [], productType: 'product', comboItems: [] })
const restaurant = reactive(blankRestaurant())
const product = reactive(blankProduct())
const categoriesJson = ref(jsonExample(exampleCategories))
const upsellsJson = ref(jsonExample(exampleUpsellRules))
const ingredientsJson = ref('[]')
const modifiersJson = ref('[]')
const aliasesText = ref('')
const allergensText = ref('')
const priceDecimal = ref('0.00')

const activeOrders = computed(() => orders.value.filter(order => !['DELIVERED', 'CANCELLED'].includes(order.status)))
const comboProductOptions = computed(() => products.value.filter(item => item.id !== product.id && !item.archived))
const statusLabel = status => ({ RECEIVED: 'Recibido', PREPARING: 'Preparando', READY: 'Listo', DELIVERED: 'Entregado', CANCELLED: 'Cancelado' }[status] || status)
const nextStatus = status => ({ RECEIVED: 'PREPARING', PREPARING: 'READY', READY: 'DELIVERED' }[status] || '')
const nextLabel = status => ({ RECEIVED: 'Iniciar preparación', PREPARING: 'Marcar listo', READY: 'Marcar entregado' }[status] || '')
const money = (value, currency = restaurant.currency) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: currency || 'PEN' }).format(Number(value || 0) / 100)
const callable = name => httpsCallable(functions, name)
const functionName = (adminName, managedName) => props.managed ? managedName : adminName

function applyCatalog(data) {
  Object.assign(restaurant, blankRestaurant(), data.restaurant)
  selectedId.value = data.restaurant.id
  categoriesJson.value = JSON.stringify(data.restaurant.categories || [], null, 2)
  upsellsJson.value = JSON.stringify(data.restaurant.upsellRules || [], null, 2)
  products.value = data.products || []
  newProduct()
}

function report(cause, prefix) {
  console.error(cause)
  const details = Array.isArray(cause?.details) ? cause.details.join(', ') : cause?.details
  error.value = `${prefix}. ${details || cause?.message || 'Inténtalo nuevamente.'}`
}

async function loadRestaurants(select = selectedId.value) {
  loading.value = true; error.value = ''
  try {
    if (props.managed) {
      const data = (await callable('getMyServeWorkspace')({})).data
      if (data.restaurant) {
        restaurants.value = [data.restaurant]
        applyCatalog(data)
      } else {
        restaurants.value = []
        selectedId.value = ''
        products.value = []
        Object.assign(restaurant, blankRestaurant())
        categoriesJson.value = jsonExample(exampleCategories)
        upsellsJson.value = jsonExample(exampleUpsellRules)
        message.value = 'Configura tu restaurante para comenzar a crear la carta y recibir pedidos.'
      }
      return
    }
    restaurants.value = (await callable('listServeRestaurants')({})).data?.restaurants || []
    if (select && restaurants.value.some(item => item.id === select)) await selectRestaurant(select)
    else if (restaurants.value.length) await selectRestaurant(restaurants.value[0].id)
  } catch (cause) { report(cause, 'No se pudieron consultar los restaurantes') }
  finally { loading.value = false }
}

async function selectRestaurant(id) {
  selectedId.value = id; error.value = ''
  try {
    const data = (await callable(functionName('getServeAdministrationCatalog', 'getMyServeWorkspace'))({ restaurantId: id })).data
    applyCatalog(data)
    if (view.value === 'kitchen') await loadOrders()
  } catch (cause) { report(cause, 'No se pudo cargar el catálogo') }
}

async function newRestaurant() {
  changeView('catalog')
  selectedId.value = ''
  products.value = []
  message.value = 'Completa los datos para registrar un nuevo restaurante.'
  error.value = ''
  Object.assign(restaurant, blankRestaurant())
  categoriesJson.value = jsonExample(exampleCategories)
  upsellsJson.value = jsonExample(exampleUpsellRules)
  newProduct()
  await nextTick()
  restaurantForm.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  restaurantForm.value?.querySelector('input')?.focus()
}

function newProduct() {
  Object.assign(product, blankProduct(), { restaurantId: selectedId.value || restaurant.id })
  aliasesText.value = ''; allergensText.value = ''; ingredientsJson.value = '[]'; modifiersJson.value = '[]'; priceDecimal.value = '0.00'
}

function editProduct(item) {
  Object.assign(product, blankProduct(), item)
  aliasesText.value = (item.aliases || []).join(', '); allergensText.value = (item.allergens || []).join(', ')
  ingredientsJson.value = JSON.stringify(item.ingredients || [], null, 2); modifiersJson.value = JSON.stringify(item.modifierGroups || [], null, 2)
  priceDecimal.value = (Number(item.price || 0) / 100).toFixed(2)
}

function addComboItem() {
  product.comboItems.push({ productId: '', quantity: 1 })
}

function removeComboItem(index) {
  product.comboItems.splice(index, 1)
}

async function saveRestaurant() {
  saving.value = true; error.value = ''; message.value = ''
  try {
    const categories = parseArrayField(categoriesJson.value, 'Categorías')
    const upsellRules = parseArrayField(upsellsJson.value, 'Reglas de sugerencias')
    const payload = plainData({ ...restaurant, categories, upsellRules })
    const result = (await callable(functionName('saveServeRestaurant', 'saveMyServeRestaurant'))({ restaurant: payload })).data
    selectedId.value = result.restaurantId; message.value = 'Restaurante guardado.'
    await loadRestaurants(result.restaurantId)
  } catch (cause) { report(cause, 'No se pudo guardar el restaurante') }
  finally { saving.value = false }
}

async function saveProduct() {
  saving.value = true; error.value = ''; message.value = ''
  try {
    if (product.productType === 'combo' && !product.comboItems.some(item => item.productId)) throw new Error('Agrega al menos un producto al combo.')
    const payload = { ...product, restaurantId: selectedId.value || restaurant.id, price: Math.round(Number(priceDecimal.value) * 100), aliases: aliasesText.value.split(',').map(value => value.trim()).filter(Boolean), allergens: allergensText.value.split(',').map(value => value.trim()).filter(Boolean), ingredients: JSON.parse(ingredientsJson.value), modifierGroups: JSON.parse(modifiersJson.value), comboItems: product.productType === 'combo' ? product.comboItems.filter(item => item.productId) : [] }
    await callable(functionName('saveServeProduct', 'saveMyServeProduct'))({ product: payload }); message.value = product.productType === 'combo' ? 'Combo guardado.' : 'Producto guardado.'
    await selectRestaurant(payload.restaurantId)
  } catch (cause) { report(cause, 'No se pudo guardar el producto; revisa los campos JSON') }
  finally { saving.value = false }
}

async function archiveProduct(item) {
  if (!window.confirm(`¿Archivar ${item.name}?`)) return
  try { await callable(functionName('archiveServeProduct', 'archiveMyServeProduct'))({ restaurantId: selectedId.value, productId: item.id }); await selectRestaurant(selectedId.value) }
  catch (cause) { report(cause, 'No se pudo archivar el producto') }
}

async function importSeed() {
  saving.value = true; error.value = ''; message.value = ''
  try {
    const initialRestaurant = { ...seedRestaurant, conversation: seedConversation, ui: seedUi, categories: seedMenu.categories, upsellRules: seedMenu.upsellRules }
    await callable('saveServeRestaurant')({ restaurant: initialRestaurant })
    for (const item of seedMenu.products) await callable('saveServeProduct')({ product: { ...item, restaurantId: seedRestaurant.id } })
    message.value = `Catálogo inicial importado: ${seedMenu.products.length} productos.`
    await loadRestaurants(seedRestaurant.id)
  } catch (cause) { report(cause, 'No se pudo importar el catálogo inicial') }
  finally { saving.value = false }
}

async function downloadExcelTemplate() {
  excelWorking.value = true
  error.value = ''
  try {
    const { downloadMenuTemplate } = await import('../../../serve-ai/src/services/menuWorkbook.js')
    await downloadMenuTemplate({ restaurant: plainData(restaurant), products: plainData(products.value) })
  } catch (cause) { report(cause, 'No se pudo generar la plantilla Excel') }
  finally { excelWorking.value = false }
}

async function selectExcelFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  excelWorking.value = true
  error.value = ''; message.value = ''; excelPreview.value = null
  try {
    const { parseMenuWorkbook } = await import('../../../serve-ai/src/services/menuWorkbook.js')
    excelPreview.value = await parseMenuWorkbook(await file.arrayBuffer())
    message.value = 'Archivo validado. Revisa el resumen y confirma la importación.'
  } catch (cause) { report(cause, 'No se pudo leer la plantilla Excel') }
  finally {
    excelWorking.value = false
    event.target.value = ''
  }
}

async function importExcelCatalog() {
  if (!excelPreview.value || excelImporting.value) return
  excelImporting.value = true
  error.value = ''; message.value = ''
  try {
    const imported = excelPreview.value
    const importedRestaurant = imported.restaurant
    const payload = plainData({
      ...restaurant,
      ...importedRestaurant,
      id: importedRestaurant.id || restaurant.id,
      name: importedRestaurant.name || restaurant.name,
      contact: { ...(restaurant.contact || {}), ...(importedRestaurant.contact || {}) },
      branding: restaurant.branding,
      conversation: restaurant.conversation,
      ui: restaurant.ui,
      categories: importedRestaurant.categories,
      upsellRules: importedRestaurant.upsellRules
    })
    if (!payload.id || !payload.name) throw new Error('La hoja Restaurante debe incluir id y nombre.')
    const result = (await callable(functionName('saveServeRestaurant', 'saveMyServeRestaurant'))({ restaurant: payload })).data
    const restaurantId = result.restaurantId
    for (let index = 0; index < imported.products.length; index += 5) {
      await Promise.all(imported.products.slice(index, index + 5).map(item => callable(functionName('saveServeProduct', 'saveMyServeProduct'))({ product: { ...item, restaurantId } })))
    }
    excelPreview.value = null
    selectedId.value = restaurantId
    await loadRestaurants(restaurantId)
    message.value = `Importación completada: ${imported.products.length} productos guardados.`
  } catch (cause) { report(cause, 'No se pudo completar la importación masiva') }
  finally { excelImporting.value = false }
}

async function loadOrders() {
  if (!selectedId.value) return
  try { orders.value = (await callable(functionName('listServeOrders', 'listMyServeOrders'))({ restaurantId: selectedId.value })).data?.orders || [] }
  catch (cause) { report(cause, 'No se pudieron consultar los pedidos') }
}

async function updateStatus(order, status) {
  try { await callable(functionName('updateServeOrderStatus', 'updateMyServeOrderStatus'))({ restaurantId: selectedId.value, orderId: order.id, status }); await loadOrders() }
  catch (cause) { report(cause, 'No se pudo actualizar el pedido') }
}

function changeView(next) {
  view.value = next
  clearInterval(refreshTimer)
  if (next === 'kitchen') {
    loadOrders()
    refreshTimer = setInterval(loadOrders, 10000)
  }
}

onMounted(loadRestaurants)
onBeforeUnmount(() => clearInterval(refreshTimer))
</script>

<template>
  <section class="serve-admin">
    <div class="serve-tabs"><button :class="{ active: view === 'catalog' }" @click="changeView('catalog')">Restaurantes y menú</button><button :class="{ active: view === 'kitchen' }" @click="changeView('kitchen')">Cocina <span>{{ activeOrders.length }}</span></button></div>
    <p v-if="message" class="serve-message">{{ message }}</p><p v-if="error" class="serve-error">{{ error }}</p>
    <div v-if="!managed" class="restaurant-picker"><label>Restaurante<select :value="selectedId" @change="selectRestaurant($event.target.value)"><option value="">Selecciona…</option><option v-for="item in restaurants" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><button type="button" @click="newRestaurant">Agregar nuevo restaurante</button><button type="button" :disabled="saving" @click="importSeed">{{ saving ? 'Procesando…' : 'Importar catálogo inicial' }}</button></div>
    <div v-else class="restaurant-picker"><div><strong>{{ restaurant.name || 'Mi establecimiento' }}</strong><small>Configura la información, carta, precios, combos y pedidos de tu local.</small></div></div>

    <section v-if="view === 'catalog'" class="excel-import-panel">
      <div><strong>Carga masiva con Excel</strong><small>Descarga la plantilla, completa las hojas y vuelve a cargarla. Si ya tienes una carta, la descarga incluirá tus datos actuales.</small></div>
      <div class="excel-actions"><button type="button" :disabled="excelWorking || excelImporting" @click="downloadExcelTemplate">{{ excelWorking ? 'Procesando…' : 'Descargar plantilla Excel' }}</button><label :class="{ disabled: excelWorking || excelImporting }">Seleccionar archivo<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" :disabled="excelWorking || excelImporting" @change="selectExcelFile"></label></div>
      <div v-if="excelPreview" class="excel-preview"><div><strong>Archivo listo para importar</strong><span>{{ excelPreview.summary.categories }} categorías · {{ excelPreview.summary.products }} productos · {{ excelPreview.summary.ingredients }} ingredientes · {{ excelPreview.summary.modifiers }} opciones · {{ excelPreview.summary.combos }} combos · {{ excelPreview.summary.suggestions }} sugerencias</span></div><button class="primary" type="button" :disabled="excelImporting" @click="importExcelCatalog">{{ excelImporting ? 'Importando…' : 'Confirmar importación' }}</button><button type="button" :disabled="excelImporting" @click="excelPreview = null">Cancelar</button></div>
    </section>

    <template v-if="view === 'catalog'">
      <div class="admin-grid">
        <form ref="restaurantForm" class="serve-panel" @submit.prevent="saveRestaurant"><h2>{{ selectedId ? 'Configuración del establecimiento' : 'Nuevo restaurante' }}</h2><div class="field-grid"><label>ID<input v-model="restaurant.id" required :disabled="Boolean(selectedId)"></label><label>Nombre<input v-model="restaurant.name" required></label><label>Moneda<input v-model="restaurant.currency" maxlength="3"></label><label>Modalidad<select v-model="restaurant.orderingMode"><option value="TABLE">Mesa</option><option value="ONLINE">En línea</option></select></label><label class="wide">Descripción<textarea v-model="restaurant.description"></textarea></label><label class="wide">Dirección<input v-model="restaurant.contact.address"></label><label>Teléfono<input v-model="restaurant.contact.phone" type="tel"></label><label>WhatsApp<input v-model="restaurant.contact.whatsapp" type="tel"></label><label class="wide">Horario de atención<textarea v-model="restaurant.businessHours" rows="3"></textarea></label><label>Color principal<input v-model="restaurant.branding.primaryColor" type="color"></label><label>Color acento<input v-model="restaurant.branding.accentColor" type="color"></label><label class="wide">Saludo de voz<input v-model="restaurant.conversation.welcomeMessage"></label><label class="check"><input v-model="restaurant.conversation.voiceEnabled" type="checkbox"> Voz disponible para clientes</label><label class="wide">Categorías (JSON)<textarea v-model="categoriesJson" rows="7"></textarea></label><label class="wide">Reglas de sugerencias (JSON)<textarea v-model="upsellsJson" rows="5"></textarea></label><label class="check"><input v-model="restaurant.active" type="checkbox"> Establecimiento activo</label></div><button class="primary" :disabled="saving">{{ saving ? 'Guardando…' : selectedId ? 'Guardar establecimiento' : 'Crear restaurante' }}</button></form>
        <section class="serve-panel"><div class="panel-heading"><h2>Productos</h2><button @click="newProduct">Nuevo</button></div><div class="product-list"><article v-for="item in products" :key="item.id"><div><strong>{{ item.name }}</strong><small>{{ item.categoryId }} · {{ money(item.price) }} · {{ item.available ? 'Disponible' : 'No disponible' }}</small></div><button @click="editProduct(item)">Editar</button><button class="danger" @click="archiveProduct(item)">Archivar</button></article><p v-if="!products.length">Aún no hay productos.</p></div></section>
      </div>
      <form v-if="selectedId || restaurant.id" class="serve-panel product-editor" @submit.prevent="saveProduct"><h2>{{ product.id ? 'Editar producto o combo' : 'Nuevo producto o combo' }}</h2><div class="field-grid"><label>ID<input v-model="product.id" required></label><label>Nombre<input v-model="product.name" required></label><label>Tipo<select v-model="product.productType"><option value="product">Producto</option><option value="combo">Combo</option></select></label><label>Categoría<select v-model="product.categoryId" required><option v-for="category in restaurant.categories" :key="category.id" :value="category.id">{{ category.name }}</option></select></label><label>Precio<input v-model="priceDecimal" type="number" min="0" step="0.01" required></label><label class="wide">Descripción<textarea v-model="product.description"></textarea></label><label class="wide">Alias separados por coma<input v-model="aliasesText"></label><label class="wide">Alérgenos separados por coma<input v-model="allergensText"></label><label class="wide">Ingredientes (JSON)<textarea v-model="ingredientsJson" rows="6"></textarea></label><label class="wide">Grupos y opciones (JSON)<textarea v-model="modifiersJson" rows="10"></textarea></label><div v-if="product.productType === 'combo'" class="wide combo-builder"><div class="panel-heading"><strong>Productos incluidos</strong><button type="button" @click="addComboItem">Agregar producto</button></div><div v-for="(comboItem, index) in product.comboItems" :key="index" class="combo-row"><select v-model="comboItem.productId" required><option value="">Selecciona un producto</option><option v-for="option in comboProductOptions" :key="option.id" :value="option.id">{{ option.name }}</option></select><input v-model.number="comboItem.quantity" type="number" min="1" max="20" required><button class="danger" type="button" @click="removeComboItem(index)">Quitar</button></div><p v-if="!product.comboItems.length">Agrega los productos y cantidades que incluye el combo.</p></div><label class="check"><input v-model="product.available" type="checkbox"> Disponible</label></div><button class="primary" :disabled="saving">Guardar {{ product.productType === 'combo' ? 'combo' : 'producto' }}</button></form>
    </template>

    <section v-else class="kitchen"><div class="panel-heading"><div><h2>Pedidos de cocina</h2><small>Actualización automática cada 10 segundos</small></div><button @click="loadOrders">Actualizar ahora</button></div><div class="order-grid"><article v-for="order in orders" :key="order.id" :class="`status-${order.status.toLowerCase()}`"><header><div><strong>{{ order.table ? `Mesa ${order.table}` : 'Pedido online' }}</strong><small>{{ order.id }}</small></div><span>{{ statusLabel(order.status) }}</span></header><ul><li v-for="item in order.items" :key="`${order.id}-${item.productId}`"><strong>{{ item.quantity }} × {{ item.name }}</strong><small v-if="item.comboItems?.length">Incluye: {{ item.comboItems.map(component => `${component.quantity} × ${component.name}`).join(', ') }}</small><small v-if="item.modifiers?.length">{{ item.modifiers.map(option => option.name).join(', ') }}</small><small v-if="item.removeIngredients?.length">Sin {{ item.removeIngredients.map(option => option.name).join(', ') }}</small></li></ul><footer><strong>{{ money(order.total, order.currency) }}</strong><div><button v-if="nextStatus(order.status)" class="primary" @click="updateStatus(order, nextStatus(order.status))">{{ nextLabel(order.status) }}</button><button v-if="!['DELIVERED', 'CANCELLED'].includes(order.status)" class="danger" @click="updateStatus(order, 'CANCELLED')">Cancelar</button></div></footer></article><p v-if="!orders.length">No hay pedidos registrados.</p></div></section>
  </section>
</template>

<style scoped>
.serve-admin{display:grid;gap:18px}.serve-tabs,.restaurant-picker,.panel-heading{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.serve-tabs button{border:0;border-bottom:3px solid transparent;background:white;padding:14px 18px;font-weight:800}.serve-tabs button.active{color:#087f8c;border-color:#00aebe}.serve-tabs span{background:#e8f8fa;border-radius:999px;padding:2px 7px}.restaurant-picker{background:white;padding:16px;border-radius:16px}.restaurant-picker>div{display:grid;gap:4px}.restaurant-picker label{display:grid;gap:5px;min-width:260px}.restaurant-picker select,.restaurant-picker button,input,select,textarea{border:1px solid #ccd9e4;border-radius:9px;padding:9px;font:inherit}.excel-import-panel{display:grid;grid-template-columns:1fr auto;align-items:center;gap:16px;padding:17px 19px;border:1px solid #cde4e7;border-radius:16px;background:#f3fbfc}.excel-import-panel>div:first-child{display:grid;gap:4px}.excel-import-panel small{color:#607586}.excel-actions{display:flex;gap:8px;flex-wrap:wrap}.excel-actions button,.excel-actions label,.excel-preview button{padding:9px 12px;border:1px solid #9ecbd0;border-radius:9px;color:#075c69;background:white;font-weight:800;cursor:pointer}.excel-actions label{position:relative;overflow:hidden}.excel-actions label.disabled{opacity:.55;cursor:not-allowed}.excel-actions input{position:absolute;width:1px;height:1px;opacity:0}.excel-preview{grid-column:1/-1;display:flex;align-items:center;gap:9px;padding-top:14px;border-top:1px solid #cde4e7}.excel-preview>div{display:grid;gap:3px;flex:1}.excel-preview span{color:#526b7d;font-size:12px}.admin-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}.serve-panel,.kitchen{background:#fff;border-radius:18px;padding:20px;box-shadow:0 8px 22px #18364b12}.serve-panel h2,.kitchen h2{margin-top:0}.field-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.field-grid label{display:grid;gap:5px;font-weight:700}.field-grid .wide{grid-column:1/-1}.field-grid .check{display:flex;align-items:center}.primary{background:#087f8c!important;color:#fff!important;border:0!important}.danger{color:#a22!important}.serve-panel button,.kitchen button{border:1px solid #bfd0dc;border-radius:9px;padding:9px 12px;background:#fff;font-weight:700}.product-list{display:grid;gap:8px;max-height:620px;overflow:auto}.product-list article{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;border:1px solid #e1e9ef;border-radius:12px;padding:10px}.product-list small,.order-grid small{display:block;color:#637586}.product-editor{margin-top:0}.combo-builder{display:grid;gap:10px;border:1px solid #dce7ee;border-radius:12px;padding:14px}.combo-row{display:grid;grid-template-columns:minmax(180px,1fr) 100px auto;gap:8px}.serve-message{background:#e7f8ef;color:#17643b;padding:12px;border-radius:10px}.serve-error{background:#fff0f0;color:#a22;padding:12px;border-radius:10px}.kitchen .panel-heading{justify-content:space-between}.order-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:18px}.order-grid article{border:1px solid #dfe7ed;border-top:5px solid #147b91;border-radius:14px;padding:14px}.order-grid article.status-ready{border-top-color:#159447}.order-grid article.status-cancelled{opacity:.65;border-top-color:#b44}.order-grid header,.order-grid footer{display:flex;justify-content:space-between;gap:10px}.order-grid header span{font-weight:800}.order-grid ul{padding-left:20px;min-height:70px}.order-grid footer{align-items:center}.order-grid footer div{display:flex;gap:7px}@media(max-width:900px){.excel-import-panel{grid-template-columns:1fr}.excel-preview{grid-column:auto;align-items:stretch;flex-direction:column}.admin-grid,.field-grid{grid-template-columns:1fr}.field-grid .wide{grid-column:auto}.combo-row{grid-template-columns:1fr}}
</style>
