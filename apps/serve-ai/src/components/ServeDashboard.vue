<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../../packages/platform/src/firebase.js'

const emit = defineEmits(['configure'])
const restaurant = ref({ name: 'Mi restaurante', currency: 'PEN', locale: 'es-PE', categories: [], upsellRules: [] })
const products = ref([])
const orders = ref([])
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
let refreshTimer = null

const callable = name => httpsCallable(functions, name)
const orderDate = order => order.createdAt ? new Date(order.createdAt) : null
const dateKey = date => date && !Number.isNaN(date.getTime())
  ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  : ''
const todayKey = () => dateKey(new Date())
const validOrders = computed(() => orders.value.filter(order => order.status !== 'CANCELLED'))
const todayOrders = computed(() => orders.value.filter(order => dateKey(orderDate(order)) === todayKey()))
const todayValidOrders = computed(() => todayOrders.value.filter(order => order.status !== 'CANCELLED'))
const todayRevenue = computed(() => todayValidOrders.value.reduce((sum, order) => sum + Number(order.total || 0), 0))
const averageTicket = computed(() => todayValidOrders.value.length ? todayRevenue.value / todayValidOrders.value.length : 0)
const activeOrders = computed(() => orders.value.filter(order => ['RECEIVED', 'PREPARING', 'READY'].includes(order.status)))
const availableProducts = computed(() => products.value.filter(product => product.available !== false && !product.archived))
const availabilityRate = computed(() => products.value.length ? Math.round(availableProducts.value.length * 100 / products.value.length) : 0)
const voiceOrders = computed(() => validOrders.value.filter(order => order.source === 'voice').length)
const voiceRate = computed(() => validOrders.value.length ? Math.round(voiceOrders.value * 100 / validOrders.value.length) : 0)

const productPerformance = computed(() => {
  const totals = new Map()
  for (const order of validOrders.value) {
    for (const item of order.items || []) {
      const current = totals.get(item.productId) || { id: item.productId, name: item.name, quantity: 0, revenue: 0 }
      current.quantity += Number(item.quantity || 0)
      current.revenue += Number(item.lineTotal || 0)
      totals.set(item.productId, current)
    }
  }
  return [...totals.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5)
})

const lastSevenDays = computed(() => {
  const result = []
  const formatter = new Intl.DateTimeFormat('es-PE', { weekday: 'short' })
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date()
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() - offset)
    const dayOrders = validOrders.value.filter(order => dateKey(orderDate(order)) === dateKey(day))
    result.push({
      key: dateKey(day),
      label: formatter.format(day).replace('.', ''),
      orders: dayOrders.length,
      revenue: dayOrders.reduce((sum, order) => sum + Number(order.total || 0), 0)
    })
  }
  const maximum = Math.max(...result.map(day => day.revenue), 1)
  return result.map(day => ({ ...day, height: Math.max(6, Math.round(day.revenue * 100 / maximum)) }))
})

const insights = computed(() => {
  const suggestions = []
  const unavailable = products.value.filter(product => product.available === false && !product.archived).length
  const withoutDescription = products.value.filter(product => !String(product.description || '').trim() && !product.archived).length
  if (activeOrders.value.length) suggestions.push({ tone: 'urgent', title: `${activeOrders.value.length} pedidos requieren atención`, copy: 'Revisa Cocina para reducir el tiempo de espera y entregar a tiempo.' })
  if (unavailable) suggestions.push({ tone: 'warning', title: `${unavailable} productos no disponibles`, copy: 'Confirma si siguen agotados o reactívalos para recuperar oportunidades de venta.' })
  if (withoutDescription) suggestions.push({ tone: 'info', title: `${withoutDescription} productos sin descripción`, copy: 'Una descripción clara mejora la elección del cliente y ayuda al asistente a recomendar.' })
  if (!restaurant.value.upsellRules?.length) suggestions.push({ tone: 'info', title: 'Activa ventas sugeridas', copy: 'Relaciona platos con bebidas o acompañamientos para elevar el ticket promedio.' })
  if (!suggestions.length) suggestions.push({ tone: 'success', title: 'La operación está saludable', copy: 'La carta está disponible y no hay alertas inmediatas por atender.' })
  return suggestions.slice(0, 3)
})

const money = value => new Intl.NumberFormat(restaurant.value.locale || 'es-PE', {
  style: 'currency', currency: restaurant.value.currency || 'PEN'
}).format(Number(value || 0) / 100)

async function loadDashboard(silent = false) {
  if (silent) refreshing.value = true
  else loading.value = true
  error.value = ''
  try {
    const [workspaceResponse, ordersResponse] = await Promise.all([
      callable('getMyServeWorkspace')({}),
      callable('listMyServeOrders')({})
    ])
    restaurant.value = workspaceResponse.data?.restaurant || restaurant.value
    products.value = workspaceResponse.data?.products || []
    orders.value = ordersResponse.data?.orders || []
  } catch (cause) {
    console.error(cause)
    error.value = cause?.message || 'No se pudo cargar el dashboard del restaurante.'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

onMounted(() => {
  loadDashboard()
  refreshTimer = setInterval(() => loadDashboard(true), 30000)
})
onBeforeUnmount(() => clearInterval(refreshTimer))
</script>

<template>
  <section class="restaurant-dashboard">
    <div class="dashboard-heading">
      <div><p class="dashboard-kicker">Resumen operativo</p><h1>{{ restaurant.name }}</h1><p>Ventas, pedidos y oportunidades para tomar decisiones rápidas.</p></div>
      <div class="dashboard-actions"><button type="button" :disabled="refreshing" @click="loadDashboard(true)">{{ refreshing ? 'Actualizando…' : 'Actualizar' }}</button><button class="primary" type="button" @click="emit('configure')">Configurar carta</button></div>
    </div>

    <p v-if="error" class="dashboard-error">{{ error }}</p>
    <div v-if="loading" class="dashboard-loading">Cargando indicadores del restaurante…</div>
    <template v-else>
      <div class="metric-grid">
        <article><span>Venta generada hoy</span><strong>{{ money(todayRevenue) }}</strong><small>{{ todayValidOrders.length }} pedidos válidos</small></article>
        <article><span>Ticket promedio hoy</span><strong>{{ money(averageTicket) }}</strong><small>Promedio por pedido no cancelado</small></article>
        <article :class="{ attention: activeOrders.length }"><span>Pedidos activos</span><strong>{{ activeOrders.length }}</strong><small>Recibidos, preparando o listos</small></article>
        <article><span>Disponibilidad de carta</span><strong>{{ availabilityRate }}%</strong><small>{{ availableProducts.length }} de {{ products.length }} productos</small></article>
      </div>

      <div class="dashboard-grid">
        <section class="dashboard-card sales-card">
          <div class="card-heading"><div><p class="dashboard-kicker">Últimos 7 días</p><h2>Ritmo de ventas</h2></div><strong>{{ money(lastSevenDays.reduce((sum, day) => sum + day.revenue, 0)) }}</strong></div>
          <div class="sales-chart" aria-label="Ventas de los últimos siete días">
            <div v-for="day in lastSevenDays" :key="day.key" class="chart-day"><div class="bar-track"><span :style="{ height: `${day.height}%` }"></span></div><strong>{{ day.label }}</strong><small>{{ day.orders }} ped.</small></div>
          </div>
        </section>

        <section class="dashboard-card">
          <div class="card-heading"><div><p class="dashboard-kicker">Demanda</p><h2>Productos más pedidos</h2></div></div>
          <div v-if="productPerformance.length" class="ranking-list"><article v-for="(product, index) in productPerformance" :key="product.id"><span>{{ index + 1 }}</span><div><strong>{{ product.name }}</strong><small>{{ money(product.revenue) }} generado</small></div><b>{{ product.quantity }}</b></article></div>
          <div v-else class="empty-metric">Aún no hay ventas suficientes para crear el ranking.</div>
        </section>

        <section class="dashboard-card insights-card">
          <div class="card-heading"><div><p class="dashboard-kicker">Acciones recomendadas</p><h2>Oportunidades de hoy</h2></div></div>
          <article v-for="insight in insights" :key="insight.title" :class="`insight-${insight.tone}`"><span></span><div><strong>{{ insight.title }}</strong><p>{{ insight.copy }}</p></div></article>
        </section>

        <section class="dashboard-card channel-card">
          <div class="card-heading"><div><p class="dashboard-kicker">Adopción digital</p><h2>Pedidos con QUIRU</h2></div><strong>{{ voiceRate }}%</strong></div>
          <p>Porcentaje de pedidos recientes iniciados mediante la experiencia de voz.</p>
          <div class="progress"><span :style="{ width: `${voiceRate}%` }"></span></div>
          <div class="channel-details"><span><b>{{ voiceOrders }}</b> por voz</span><span><b>{{ validOrders.length - voiceOrders }}</b> manuales</span></div>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.restaurant-dashboard{display:grid;gap:20px}.dashboard-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}.dashboard-heading h1{margin:3px 0 7px;font-size:clamp(28px,4vw,42px);letter-spacing:-.035em}.dashboard-heading p{margin:0;color:#64748b}.dashboard-kicker{margin:0!important;color:#00899b!important;font-size:11px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}.dashboard-actions{display:flex;gap:9px}.dashboard-actions button{padding:10px 14px;border:1px solid #cdd9e4;border-radius:11px;background:white;font-weight:800;cursor:pointer}.dashboard-actions .primary{border-color:#087f8c;color:white;background:#087f8c}.dashboard-actions button:disabled{opacity:.55}.dashboard-error,.dashboard-loading{padding:16px;border-radius:14px;background:white}.dashboard-error{color:#a5283c;background:#fff0f2}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.metric-grid article{display:grid;gap:7px;padding:20px;border:1px solid #e0e8ef;border-radius:17px;background:white;box-shadow:0 9px 28px rgba(6,26,51,.06)}.metric-grid article.attention{border-color:#f2c36b;background:#fffaf0}.metric-grid span{color:#607286;font-size:12px;font-weight:750}.metric-grid strong{font-size:28px;letter-spacing:-.035em}.metric-grid small{color:#8290a0}.dashboard-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:16px}.dashboard-card{min-width:0;padding:20px;border:1px solid #e0e8ef;border-radius:18px;background:white;box-shadow:0 9px 28px rgba(6,26,51,.05)}.card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}.card-heading h2{margin:4px 0 0;font-size:20px}.card-heading>strong{font-size:22px}.sales-chart{height:210px;display:grid;grid-template-columns:repeat(7,1fr);gap:9px;align-items:end}.chart-day{height:100%;display:grid;grid-template-rows:1fr auto auto;gap:5px;text-align:center}.bar-track{height:100%;display:flex;align-items:flex-end;justify-content:center;border-radius:9px;background:#f0f5f7;overflow:hidden}.bar-track span{width:100%;min-height:6px;border-radius:9px 9px 0 0;background:linear-gradient(180deg,#00c7d9,#087f8c)}.chart-day>strong{text-transform:capitalize;font-size:12px}.chart-day>small{color:#8290a0;font-size:10px}.ranking-list{display:grid;gap:8px}.ranking-list article{display:grid;grid-template-columns:32px 1fr auto;align-items:center;gap:10px;padding:10px;border-radius:12px;background:#f7fafb}.ranking-list article>span{width:29px;height:29px;display:grid;place-items:center;border-radius:9px;color:#087f8c;background:#e1f8fa;font-weight:900}.ranking-list article div{display:grid;gap:2px}.ranking-list small{color:#748598}.ranking-list b{font-size:18px}.empty-metric{padding:30px 10px;text-align:center;color:#748598}.insights-card{display:grid;align-content:start;gap:9px}.insights-card .card-heading{margin-bottom:5px}.insights-card>article{display:grid;grid-template-columns:8px 1fr;gap:11px;padding:12px;border-radius:12px;background:#f7fafb}.insights-card>article>span{border-radius:999px;background:#4ba6b0}.insights-card article.insight-urgent>span{background:#d64b5f}.insights-card article.insight-warning>span{background:#e2a025}.insights-card article.insight-success>span{background:#22a06b}.insights-card p{margin:4px 0 0;color:#65778a;font-size:12px;line-height:1.45}.channel-card>p{color:#65778a;line-height:1.5}.progress{height:12px;margin:20px 0 14px;overflow:hidden;border-radius:999px;background:#eaf0f4}.progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#0066ff,#7157ff)}.channel-details{display:flex;justify-content:space-between;gap:12px;color:#65778a}.channel-details b{color:#142b45}@media(max-width:950px){.metric-grid{grid-template-columns:repeat(2,1fr)}.dashboard-grid{grid-template-columns:1fr}}@media(max-width:600px){.dashboard-heading{align-items:stretch;flex-direction:column}.dashboard-actions button{flex:1}.metric-grid{grid-template-columns:1fr}.sales-chart{gap:4px}.dashboard-card{padding:16px}}
</style>
