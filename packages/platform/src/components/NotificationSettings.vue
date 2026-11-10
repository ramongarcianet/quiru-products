<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { DEFAULT_REMINDER_OFFSETS_MINUTES } from '../../../notification-core/src/index.js'
import {
  activatePushNotifications,
  browserNotificationState,
  loadNotificationPreferences,
  saveNotificationPreferences,
  sendTestNotification,
  subscribeForegroundNotifications
} from '../notifications/notificationClient.js'

const props = defineProps({
  product: { type: String, required: true },
  showSettings: { type: Boolean, default: true }
})

const preferences = reactive({
  pushEnabled: false,
  appointmentReminders: true,
  reminderOffsetsMinutes: [...DEFAULT_REMINDER_OFFSETS_MINUTES]
})
const permission = ref(browserNotificationState())
const busy = ref(false)
const loading = ref(true)
const message = ref('')
const error = ref('')
const showHelp = ref(false)
const foreground = ref(null)
const iosDevice = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
)
const androidDevice = typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent)
const standaloneMode = typeof window !== 'undefined' && (
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
)
const iosNeedsInstallation = iosDevice && !standaloneMode
let foregroundTimer = null
let unsubscribeForeground = null

const productName = computed(() => props.product === 'DENT' ? 'QUIRU Dent AI' : 'QUIRU Agenda')
const offsetOptions = [
  { value: 1440, label: '24 horas antes' },
  { value: 120, label: '2 horas antes' },
  { value: 30, label: '30 minutos antes' }
]

function showForeground(notification) {
  foreground.value = notification
  clearTimeout(foregroundTimer)
  foregroundTimer = setTimeout(() => { foreground.value = null }, 8000)
}

async function load() {
  loading.value = true
  try {
    const data = await loadNotificationPreferences(props.product)
    preferences.pushEnabled = data.pushEnabled === true
    preferences.appointmentReminders = data.appointmentReminders !== false
    preferences.reminderOffsetsMinutes = Array.isArray(data.reminderOffsetsMinutes)
      ? data.reminderOffsetsMinutes : [...DEFAULT_REMINDER_OFFSETS_MINUTES]
  } catch (cause) { error.value = cause?.message || 'No se pudieron cargar las preferencias.' }
  finally { loading.value = false }
}

async function activate() {
  busy.value = true; error.value = ''; message.value = ''
  try {
    await activatePushNotifications(props.product)
    permission.value = browserNotificationState()
    preferences.pushEnabled = true
    message.value = 'Notificaciones activadas en este dispositivo.'
  } catch (cause) {
    permission.value = browserNotificationState()
    error.value = cause?.message || 'No se pudieron activar las notificaciones.'
  } finally { busy.value = false }
}

async function save() {
  busy.value = true; error.value = ''; message.value = ''
  try {
    if (preferences.pushEnabled && permission.value !== 'granted') {
      await activate()
      if (permission.value !== 'granted') return
    }
    await saveNotificationPreferences({ product: props.product, ...preferences })
    message.value = 'Preferencias de notificación guardadas.'
  } catch (cause) { error.value = cause?.message || 'No se pudieron guardar las preferencias.' }
  finally { busy.value = false }
}

async function test() {
  busy.value = true; error.value = ''; message.value = ''
  try {
    const result = await sendTestNotification(props.product)
    message.value = `Notificación enviada a ${result.sent} dispositivo${result.sent === 1 ? '' : 's'}.`
  } catch (cause) { error.value = cause?.message || 'No se pudo enviar la notificación de prueba.' }
  finally { busy.value = false }
}

onMounted(() => {
  load()
  unsubscribeForeground = subscribeForegroundNotifications(showForeground)
})
onBeforeUnmount(() => { unsubscribeForeground?.(); clearTimeout(foregroundTimer) })
</script>

<template>
  <Transition name="notification-toast">
    <aside v-if="foreground" class="notification-foreground" role="status">
      <span>{{ product === 'DENT' ? '🦷' : '🔔' }}</span>
      <div><strong>{{ foreground.title }}</strong><p>{{ foreground.body }}</p></div>
      <button type="button" aria-label="Cerrar" @click="foreground = null">×</button>
    </aside>
  </Transition>

  <section v-if="showSettings" class="notification-settings">
    <div class="notification-heading"><div><p class="notification-kicker">Notificaciones</p><h2>Recordatorios push</h2><p>Recibe alertas de citas aunque la aplicación no esté abierta.</p></div><span class="permission-badge" :class="permission">{{ permission === 'granted' ? 'Activas' : permission === 'denied' ? 'Bloqueadas' : permission === 'unsupported' ? 'No compatible' : 'Sin activar' }}</span></div>
    <p v-if="loading">Cargando preferencias…</p>
    <template v-else>
      <div v-if="iosNeedsInstallation" class="ios-install-help">
        <strong>Instala QUIRU Agenda en tu iPhone</strong>
        <p>Safari solo permite notificaciones web desde una aplicación agregada a la pantalla de inicio.</p>
        <ol><li>Pulsa <strong>Compartir</strong> en Safari.</li><li>Elige <strong>Añadir a pantalla de inicio</strong>.</li><li>Abre QUIRU Agenda desde el nuevo icono y registra este dispositivo.</li></ol>
      </div>
      <div class="activation-box">
        <div><strong>🔔 {{ permission === 'granted' ? 'Registrar este dispositivo' : 'Activar notificaciones' }}</strong><p>{{ permission === 'granted' ? 'El permiso ya está concedido; falta asociar este navegador con tu cuenta.' : 'El navegador solicitará permiso solo después de pulsar el botón.' }}</p></div>
        <button type="button" :disabled="busy || permission === 'unsupported'" @click="activate">{{ busy ? 'Registrando…' : permission === 'granted' ? 'Registrar este dispositivo' : 'Activar notificaciones' }}</button>
      </div>
      <div v-if="permission === 'denied'" class="blocked-help">
        <p>Las notificaciones están bloqueadas en tu navegador.</p>
        <button type="button" @click="showHelp = !showHelp">Ver cómo activarlas</button>
        <ol v-if="showHelp && androidDevice">
          <li>En Chrome, pulsa <strong>⋮ → Configuración → Configuración de sitios → Notificaciones</strong>.</li>
          <li>Busca <strong>quiru-agenda.web.app</strong> entre los sitios bloqueados y selecciona <strong>Permitir</strong>. Si no aparece esa opción, usa <strong>Borrar y restablecer</strong>.</li>
          <li>Comprueba también en Android: <strong>Ajustes → Aplicaciones → Chrome → Notificaciones → Permitir</strong>.</li>
          <li>Regresa a Agenda, recarga la página y pulsa <strong>Registrar este dispositivo</strong>.</li>
        </ol>
        <ol v-else-if="showHelp">
          <li>Abre los controles o la información del sitio desde la barra de direcciones.</li>
          <li>Cambia <strong>Notificaciones</strong> a <strong>Permitir</strong>.</li>
          <li>Recarga la página y pulsa <strong>Registrar este dispositivo</strong>.</li>
        </ol>
      </div>
      <div class="preference-list">
        <label><input v-model="preferences.pushEnabled" type="checkbox"> <span><strong>Push habilitado</strong><small>Permite alertas para {{ productName }} en dispositivos registrados.</small></span></label>
        <label><input v-model="preferences.appointmentReminders" type="checkbox"> <span><strong>Recordatorios de citas</strong><small>Programa avisos antes de cada cita.</small></span></label>
        <fieldset :disabled="!preferences.pushEnabled || !preferences.appointmentReminders"><legend>¿Cuándo deseas recibirlos?</legend><label v-for="option in offsetOptions" :key="option.value"><input v-model="preferences.reminderOffsetsMinutes" type="checkbox" :value="option.value"> <span>{{ option.label }}</span></label></fieldset>
      </div>
      <p v-if="message" class="notification-success">{{ message }}</p><p v-if="error" class="notification-error">{{ error }}</p>
      <div class="notification-actions"><button class="notification-primary" type="button" :disabled="busy" @click="save">{{ busy ? 'Guardando…' : 'Guardar preferencias' }}</button><button type="button" :disabled="busy || permission !== 'granted' || !preferences.pushEnabled" @click="test">Enviar notificación de prueba</button></div>
    </template>
  </section>
</template>

<style scoped>
.notification-settings{display:grid;gap:18px;margin-top:18px;padding:22px;border:1px solid #dce5ee;border-radius:18px;background:#fff;box-shadow:0 8px 24px rgba(7,27,64,.05)}.notification-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.notification-heading h2{margin:4px 0 6px}.notification-heading p{margin:0;color:#607388}.notification-kicker{color:#008fa6!important;font-size:10px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}.permission-badge{padding:6px 10px;border-radius:999px;color:#775600;background:#fff2c9;font-size:11px;font-weight:800}.permission-badge.granted{color:#17643b;background:#e4f8ed}.permission-badge.denied{color:#a22;background:#fff0f0}.ios-install-help{padding:16px;border:1px solid #bdd5ff;border-radius:13px;color:#17365f;background:#eef5ff}.ios-install-help p{margin:5px 0 8px;color:#52657f}.ios-install-help ol{margin:0;padding-left:22px}.activation-box{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px;border-radius:13px;background:#eef8fb}.activation-box p{margin:4px 0 0;color:#607388}.activation-box button,.notification-actions button,.blocked-help button{padding:9px 13px;border:1px solid #b7ccd8;border-radius:10px;background:white;font-weight:800;cursor:pointer}.blocked-help{padding:13px;border-radius:11px;color:#8b2938;background:#fff2f3}.blocked-help p{margin:0 0 8px}.blocked-help ol{margin-bottom:0}.preference-list{display:grid;gap:12px}.preference-list>label{display:flex;align-items:flex-start;gap:10px;padding:13px;border:1px solid #e4ebf0;border-radius:12px}.preference-list label span{display:grid;gap:3px}.preference-list small{color:#6c7d8e}.preference-list fieldset{display:grid;gap:9px;margin:0;padding:14px;border:1px solid #e4ebf0;border-radius:12px}.preference-list fieldset label{display:flex;gap:8px}.notification-actions{display:flex;gap:9px;flex-wrap:wrap}.notification-actions .notification-primary{color:white;border-color:#087f8c;background:#087f8c}.notification-success{padding:10px;border-radius:9px;color:#17643b;background:#e7f8ef}.notification-error{padding:10px;border-radius:9px;color:#a22;background:#fff0f0}.notification-foreground{position:fixed;z-index:2000;top:18px;right:18px;width:min(390px,calc(100vw - 36px));display:grid;grid-template-columns:auto 1fr auto;gap:11px;padding:15px;border:1px solid #b9dce2;border-radius:15px;color:#102a43;background:white;box-shadow:0 18px 55px rgba(7,27,64,.22)}.notification-foreground>span{font-size:24px}.notification-foreground p{margin:4px 0 0;color:#607388;font-size:13px}.notification-foreground button{border:0;background:transparent;font-size:23px;cursor:pointer}.notification-toast-enter-active,.notification-toast-leave-active{transition:.2s}.notification-toast-enter-from,.notification-toast-leave-to{opacity:0;transform:translateY(-12px)}@media(max-width:600px){.notification-heading,.activation-box{align-items:stretch;flex-direction:column}.notification-actions button{flex:1}}
</style>
