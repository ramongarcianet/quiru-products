<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import AppointmentBoard from './AppointmentBoard.vue'
import CatalogManager from './CatalogManager.vue'
import {
  archiveCatalogItem,
  createAppointment,
  createCatalogItem,
  saveBusiness,
  subscribeBusiness,
  subscribeCollection,
  updateCatalogItem,
  updateAppointmentStatus
} from '../services/smartAgendaRepository.js'
import {
  activeAppointment,
  appointmentCountsForMonth,
  customersWithUpcomingBirthdays,
  customersApproachingMonthlyFollowUp,
  formatAppointmentRange,
  normalizeWhatsAppNumber
} from '../domain/booking.js'

const props = defineProps({
  access: { type: Object, required: true },
  user: { type: Object, required: true },
  logout: { type: Function, required: true },
  portalUrl: { type: String, default: '' }
})

const businessId = computed(() =>
  props.access.organizationId || props.access.profile.businessId || props.access.profile.id || props.user.uid)
const activeTab = ref('dashboard')
const business = ref({})
const customers = ref([])
const professionals = ref([])
const services = ref([])
const appointments = ref([])
const loading = ref(true)
const error = ref('')
const settingsBusy = ref(false)
const settingsMessage = ref('')
const settings = reactive({ name: '', timeZone: 'America/Lima', locale: 'es-PE', whatsappPhone: '', countryCallingCode: '51', birthdayDiscountPercent: 0 })
const unsubscribers = []

const activeCount = values => values.filter(item => item.active !== false).length
const futureAppointments = computed(() => appointments.value
  .filter(activeAppointment)
  .filter(item => (item.startAt?.toMillis?.() || 0) >= Date.now())
  .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis()))
const monthlyFollowUps = computed(() => customersApproachingMonthlyFollowUp(
  appointments.value,
  customers.value
))
const upcomingBirthdays = computed(() => customersWithUpcomingBirthdays(
  customers.value,
  new Date(),
  15,
  settings.timeZone
))
const monthlyAppointmentCounts = computed(() => appointmentCountsForMonth(
  appointments.value,
  new Date(),
  settings.timeZone
))

const tabs = [
  { id: 'dashboard', label: 'Resumen' },
  { id: 'appointments', label: 'Agenda' },
  { id: 'customers', label: 'Clientes' },
  { id: 'professionals', label: 'Profesionales' },
  { id: 'services', label: 'Servicios' },
  { id: 'settings', label: 'Configuración' }
]

const customerFields = [
  { key: 'name', label: 'Nombre completo' },
  { key: 'phone', label: 'Teléfono', type: 'tel' },
  { key: 'email', label: 'Correo', type: 'email', required: false },
  { key: 'birthday', label: 'Fecha de cumpleaños', type: 'date', required: false }
]
const professionalFields = [
  { key: 'name', label: 'Nombre completo' },
  { key: 'phone', label: 'Teléfono', type: 'tel', required: false },
  { key: 'email', label: 'Correo', type: 'email', required: false }
]
const serviceFields = [
  { key: 'name', label: 'Nombre del servicio' },
  { key: 'durationMinutes', label: 'Duración (min)', type: 'number', min: 15, max: 480, step: 15, default: 30 },
  { key: 'price', label: 'Precio', type: 'number', min: 0, step: '0.01', default: 0 }
]

function handleSubscriptionError(cause) {
  console.error(cause)
  error.value = 'No fue posible leer la información del negocio. Revisa los permisos de Firestore.'
  loading.value = false
}

onMounted(() => {
  const id = businessId.value
  unsubscribers.push(
    subscribeBusiness(id, value => {
      business.value = value
      settings.name = value.name || ''
      settings.timeZone = value.timeZone || 'America/Lima'
      settings.locale = value.locale || 'es-PE'
      settings.whatsappPhone = value.whatsappPhone || ''
      settings.countryCallingCode = value.countryCallingCode || '51'
      settings.birthdayDiscountPercent = Number(value.birthdayDiscountPercent || 0)
      loading.value = false
    }, handleSubscriptionError),
    subscribeCollection(id, 'customers', value => { customers.value = value }, handleSubscriptionError),
    subscribeCollection(id, 'professionals', value => { professionals.value = value }, handleSubscriptionError),
    subscribeCollection(id, 'services', value => { services.value = value }, handleSubscriptionError),
    subscribeCollection(id, 'appointments', value => { appointments.value = value }, handleSubscriptionError)
  )
})

onBeforeUnmount(() => unsubscribers.forEach(unsubscribe => unsubscribe?.()))

const createItem = collectionName => values => createCatalogItem(
  businessId.value, collectionName, values, props.user.uid)
const updateItem = collectionName => (itemId, values) => updateCatalogItem(
  businessId.value, collectionName, itemId, values, props.user.uid)
const archiveItem = collectionName => item => archiveCatalogItem(
  businessId.value, collectionName, item.id, props.user.uid)

const createBooking = values => createAppointment(businessId.value, {
  ...values,
  timeZone: settings.timeZone,
  source: 'manual'
}, props.user.uid)

const changeStatus = (appointment, status) => updateAppointmentStatus(
  businessId.value, appointment, status, props.user.uid)

async function saveSettings() {
  settingsBusy.value = true
  settingsMessage.value = ''
  try {
    const birthdayDiscountPercent = Number(settings.birthdayDiscountPercent)
    if (!Number.isFinite(birthdayDiscountPercent) || birthdayDiscountPercent < 0 || birthdayDiscountPercent > 100) {
      throw new Error('El descuento de cumpleaños debe estar entre 0 y 100%.')
    }
    await saveBusiness(businessId.value, { ...settings, birthdayDiscountPercent }, props.user.uid)
    settingsMessage.value = 'Configuración guardada.'
  } catch (cause) {
    settingsMessage.value = cause?.message || 'No se pudo guardar.'
  } finally {
    settingsBusy.value = false
  }
}

function customerPhoneFor(appointment) {
  return appointment.customerPhone || customers.value.find(item => item.id === appointment.customerId)?.phone || ''
}

function sendWhatsAppReminder(appointment) {
  const phone = normalizeWhatsAppNumber(customerPhoneFor(appointment), settings.countryCallingCode)
  if (!phone) {
    window.alert('El cliente no tiene un celular válido. Agrégalo en la sección Clientes.')
    return
  }
  const businessPhone = settings.whatsappPhone ? `\nConsultas: ${settings.whatsappPhone}` : ''
  const message = [
    `Hola ${appointment.customerName},`,
    `te recordamos tu cita en ${business.value.name || 'nuestro negocio'}.`,
    `Servicio: ${appointment.serviceName}`,
    `Profesional: ${appointment.professionalName}`,
    `Fecha y hora: ${formatAppointmentRange(appointment, settings.timeZone)}${businessPhone}`,
    '',
    'Por favor, confírmanos tu asistencia. Gracias.'
  ].join('\n')
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
}

function sendBirthdayDiscount(customer) {
  const discount = Number(settings.birthdayDiscountPercent || 0)
  if (discount <= 0) {
    window.alert('Configura primero el porcentaje de descuento por cumpleaños.')
    return
  }
  const phone = normalizeWhatsAppNumber(customer.customerPhone, settings.countryCallingCode)
  if (!phone) {
    window.alert('El cliente no tiene un celular válido. Agrégalo o edítalo en la sección Clientes.')
    return
  }
  const businessPhone = settings.whatsappPhone ? `\nConsultas: ${settings.whatsappPhone}` : ''
  const message = [
    `Hola ${customer.customerName},`,
    `en ${business.value.name || 'nuestro negocio'} queremos celebrar tu cumpleaños contigo.`,
    `Tienes un ${discount}% de descuento especial por tu cumpleaños.${businessPhone}`,
    '',
    'Contáctanos para reservar. ¡Feliz cumpleaños!'
  ].join('\n')
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
}

function formatAttentionDate(value) {
  return new Intl.DateTimeFormat(settings.locale || 'es-PE', {
    timeZone: settings.timeZone,
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(value)
}

function formatBirthday(value) {
  return new Intl.DateTimeFormat(settings.locale || 'es-PE', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'long'
  }).format(value)
}
</script>

<template>
  <div class="agenda-app">
    <header class="product-header">
      <div class="brand">QUIRU <small>AGENDA INTELIGENTE · BY QUIRU LABS</small></div>
      <div class="business-title"><strong>{{ business.name || 'Mi negocio' }}</strong><span>{{ user.email }}</span></div>
      <div class="actions"><button class="button secondary" type="button" @click="logout">Salir</button></div>
    </header>

    <nav class="product-nav" aria-label="Secciones de Agenda inteligente">
      <button v-for="tab in tabs" :key="tab.id" type="button" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">{{ tab.label }}</button>
    </nav>

    <main class="workspace-content">
      <div v-if="loading" class="panel">Cargando negocio…</div>
      <div v-else-if="error" class="panel error" role="alert">{{ error }}</div>

      <template v-else>
        <section v-if="activeTab === 'dashboard'" class="dashboard-view">
          <div class="welcome-card"><div><p class="eyebrow">Resumen operativo</p><h1>{{ business.name || 'Configura tu negocio' }}</h1><p>Clientes, profesionales, servicios y citas en un solo lugar.</p></div><button class="button primary" type="button" @click="activeTab = 'appointments'">Nueva cita</button></div>
          <div class="metric-grid">
            <article><strong>{{ futureAppointments.length }}</strong><span>Próximas citas</span></article>
            <article><strong>{{ monthlyAppointmentCounts.completed }}</strong><span>Citas atendidas este mes</span></article>
            <article><strong>{{ monthlyAppointmentCounts.cancelled }}</strong><span>Citas canceladas este mes</span></article>
            <article><strong>{{ activeCount(customers) }}</strong><span>Clientes</span></article>
            <article><strong>{{ activeCount(professionals) }}</strong><span>Profesionales</span></article>
            <article><strong>{{ activeCount(services) }}</strong><span>Servicios</span></article>
          </div>
          <section class="upcoming"><h2>Próximas citas</h2><article v-for="appointment in futureAppointments.slice(0, 6)" :key="appointment.id"><div><strong>{{ appointment.customerName }}</strong><p>{{ appointment.serviceName }} con {{ appointment.professionalName }}</p></div><div class="upcoming-actions"><span>{{ formatAppointmentRange(appointment, settings.timeZone) }}</span><button class="button whatsapp-button" type="button" @click="sendWhatsAppReminder(appointment)">Enviar recordatorio</button></div></article><p v-if="!futureAppointments.length" class="muted">Aún no hay citas próximas.</p></section>
          <section class="upcoming follow-up-list birthday-list">
            <div class="section-heading"><div><h2>Próximos cumpleaños</h2><p>Clientes que cumplen años durante los próximos 15 días.</p></div><span class="follow-up-count">{{ upcomingBirthdays.length }}</span></div>
            <article v-for="customer in upcomingBirthdays" :key="customer.customerId || `${customer.customerName}-${customer.birthday}`">
              <div><strong>{{ customer.customerName }}</strong><p>Cumpleaños: {{ formatBirthday(customer.nextBirthday) }}</p></div>
              <div class="follow-up-status"><strong>{{ customer.daysUntilBirthday === 0 ? 'Cumple años hoy' : customer.daysUntilBirthday === 1 ? 'Cumple años mañana' : `Faltan ${customer.daysUntilBirthday} días` }}</strong><span v-if="customer.customerPhone">{{ customer.customerPhone }}</span><button class="button whatsapp-button" type="button" @click="sendBirthdayDiscount(customer)">Notificar descuento ({{ Number(settings.birthdayDiscountPercent || 0) }}%)</button></div>
            </article>
            <p v-if="!upcomingBirthdays.length" class="muted">No hay cumpleaños registrados en los próximos 15 días.</p>
          </section>
          <section class="upcoming follow-up-list">
            <div class="section-heading"><div><h2>Clientes próximos a cumplir un mes</h2><p>Seguimiento basado en la última cita completada.</p></div><span class="follow-up-count">{{ monthlyFollowUps.length }}</span></div>
            <article v-for="customer in monthlyFollowUps" :key="customer.customerId || customer.customerName">
              <div><strong>{{ customer.customerName }}</strong><p>Última atención: {{ formatAttentionDate(customer.attendedAt) }}</p></div>
              <div class="follow-up-status"><strong>{{ customer.daysUntilMonth === 0 ? 'Cumple un mes hoy' : `Faltan ${customer.daysUntilMonth} días` }}</strong><span v-if="customer.customerPhone">{{ customer.customerPhone }}</span></div>
            </article>
            <p v-if="!monthlyFollowUps.length" class="muted">No hay clientes próximos a cumplir un mes desde su última atención.</p>
          </section>
        </section>

        <AppointmentBoard v-else-if="activeTab === 'appointments'" :appointments="appointments" :customers="customers" :professionals="professionals" :services="services" :time-zone="settings.timeZone" :voice-enabled="access.features?.voice === true" :on-create="createBooking" :on-status="changeStatus" />
        <CatalogManager v-else-if="activeTab === 'customers'" title="Clientes" description="Personas que reservan servicios." :items="customers" :fields="customerFields" searchable search-placeholder="Buscar por nombre, teléfono, correo, cumpleaños o cualquier otro dato…" :on-create="createItem('customers')" :on-update="updateItem('customers')" :on-archive="archiveItem('customers')" />
        <CatalogManager v-else-if="activeTab === 'professionals'" title="Profesionales" description="Personal que atiende las reservas." :items="professionals" :fields="professionalFields" :on-create="createItem('professionals')" :on-update="updateItem('professionals')" :on-archive="archiveItem('professionals')" />
        <CatalogManager v-else-if="activeTab === 'services'" title="Servicios" description="Duración y precio utilizados para reservar." :items="services" :fields="serviceFields" :on-create="createItem('services')" :on-update="updateItem('services')" :on-archive="archiveItem('services')" />

        <form v-else class="panel stack settings-form" @submit.prevent="saveSettings">
          <div><p class="eyebrow">Negocio</p><h1>Configuración</h1><p class="muted">Estos valores controlan fechas y lenguaje de la agenda.</p></div>
          <label>Nombre del negocio<input v-model="settings.name" class="field" required></label>
          <label>Zona horaria<input v-model="settings.timeZone" class="field" required></label>
          <label>Idioma<input v-model="settings.locale" class="field" required></label>
          <label>Código de país<input v-model="settings.countryCallingCode" class="field" inputmode="numeric" placeholder="51" required></label>
          <label>Celular del negocio para WhatsApp<input v-model="settings.whatsappPhone" class="field" type="tel" placeholder="+51 987 654 321" required></label>
          <label>Descuento por cumpleaños (%)<input v-model.number="settings.birthdayDiscountPercent" class="field" type="number" min="0" max="100" step="1" required></label>
          <p v-if="settingsMessage" :class="settingsMessage.includes('guardada') ? 'success' : 'error'">{{ settingsMessage }}</p>
          <button class="button primary" :disabled="settingsBusy" type="submit">{{ settingsBusy ? 'Guardando…' : 'Guardar configuración' }}</button>
        </form>
      </template>
    </main>
  </div>
</template>

<style scoped>
.agenda-app { min-height: 100vh; background: #f5f7fb; }
.product-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 18px max(24px, calc((100vw - 1240px) / 2)); background: #071b40; color: white; }
.product-header .brand small { color: #a9c5ea; }
.business-title { display: grid; text-align: center; }
.business-title span { color: #a9bad0; font-size: 12px; }
.product-nav { display: flex; gap: 6px; padding: 10px max(20px, calc((100vw - 1240px) / 2)); overflow-x: auto; background: white; border-bottom: 1px solid #e2e8f0; }
.product-nav button { padding: 10px 14px; border: 0; border-radius: 10px; color: #52657f; background: transparent; font-weight: 750; cursor: pointer; white-space: nowrap; }
.product-nav button.active { color: #0066ff; background: #eaf2ff; }
.workspace-content { width: min(1240px, calc(100% - 36px)); margin: 0 auto; padding: 26px 0 50px; }
.welcome-card { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 32px; color: white; background: linear-gradient(135deg, #071b40, #0066ff 65%, #643bff); border-radius: 22px; }
.welcome-card h1 { font-size: clamp(28px, 4vw, 46px); }
.welcome-card p:last-child { margin-bottom: 0; color: #dbe9ff; }
.metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin: 18px 0; }
.metric-grid article { display: grid; padding: 22px; background: white; border: 1px solid #e2e8f0; border-radius: 16px; }
.metric-grid strong { color: #0066ff; font-size: 30px; }.metric-grid span { color: #52657f; }
.upcoming { padding: 24px; background: white; border: 1px solid #e2e8f0; border-radius: 18px; }
.follow-up-list { margin-top: 18px; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.section-heading h2 { margin-bottom: 4px; }.section-heading p { margin: 0; color: #52657f; }
.follow-up-count { display: grid; min-width: 38px; min-height: 38px; place-items: center; border-radius: 12px; color: #0066ff; background: #eaf2ff; font-weight: 800; }
.follow-up-status { display: grid; justify-items: end; gap: 3px; color: #0066ff; }.follow-up-status span { color: #52657f; font-size: 13px; }
.upcoming article { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 14px 0; border-top: 1px solid #edf1f6; }
.upcoming article p { margin: 3px 0 0; color: #52657f; }.upcoming-actions { display: grid; justify-items: end; gap: 8px; }.upcoming-actions > span { color: #0066ff; font-size: 13px; font-weight: 800; }
.whatsapp-button { min-height: 36px; padding: 7px 12px; color: white; background: #168c52; font-size: 12px; }
.settings-form { width: min(100%, 620px); }.settings-form label { display: grid; gap: 7px; font-weight: 700; }
@media (max-width: 800px) { .product-header { align-items: flex-start; flex-wrap: wrap; }.business-title { order: 3; width: 100%; text-align: left; }.metric-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 520px) { .welcome-card { align-items: flex-start; flex-direction: column; }.metric-grid { grid-template-columns: 1fr; }.upcoming article { align-items: flex-start; flex-direction: column; }.upcoming-actions, .follow-up-status { justify-items: start; } }
</style>
