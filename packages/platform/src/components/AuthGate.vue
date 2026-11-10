<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, firestore } from '../firebase.js'
import { loadUserAccess } from '../access.js'
import { canAccessModule } from '../authorization.js'

const props = defineProps({ requiredModule: { type: String, default: null }, portalUrl: { type: String, default: '' } })

const BRANDING = Object.freeze({
  platform: {
    product: 'QUIRU LABS', badge: 'PLATAFORMA MODULAR · ACCESO SEGURO', accent: '#643bff',
    headline: 'Todos tus productos QUIRU, en un solo lugar.',
    description: 'Una plataforma compartida para acceder a tus herramientas, datos y flujos de trabajo con una sola cuenta.',
    welcome: 'Bienvenido a QUIRU LABS', welcomeText: 'Ingresa al portal para acceder a los productos habilitados para tu cuenta.',
    metrics: [['Productos', 'Módulos independientes para cada necesidad'], ['Seguridad', 'Una identidad y accesos centralizados'], ['Evolución', 'Una plataforma preparada para crecer']]
  },
  'user-admin': {
    product: 'QUIRU Administración', badge: 'USUARIOS · PERMISOS · ORGANIZACIONES', accent: '#7c3aed',
    headline: 'El control de tus productos, claro y centralizado.',
    description: 'Gestiona usuarios y define con precisión los módulos que cada persona puede utilizar.',
    welcome: 'Bienvenido a Administración', welcomeText: 'Ingresa para administrar usuarios, organizaciones y accesos a productos.',
    metrics: [['Usuarios', 'Perfiles y cuentas en un solo lugar'], ['Accesos', 'Permisos explícitos por producto'], ['Control', 'Gestión segura y trazable']]
  },
  dentistry: {
    product: 'QUIRU Dent AI', badge: 'HEALTHTECH · VOICE AI · DENTAL TECHNOLOGY', accent: '#643bff',
    headline: 'Tu práctica odontológica, impulsada por Inteligencia Artificial.',
    description: 'Tecnología odontológica, Inteligencia Artificial y reconocimiento de voz para una experiencia digital más natural.',
    welcome: 'Bienvenido a QUIRU Dent AI', welcomeText: 'Tu asistente odontológico inteligente. Ingresa a tu espacio de trabajo clínico.',
    metrics: [['Voz', 'Interacción natural durante la atención'], ['Inteligencia Artificial', 'Asistencia integrada al flujo clínico'], ['Odontología', 'Herramientas claras para tu práctica']]
  },
  'smart-agenda': {
    product: 'QUIRU Agenda Inteligente', badge: 'AGENDA · VOZ · EXPERIENCIA DEL CLIENTE', accent: '#00a9d6',
    headline: 'Tus citas organizadas, tus clientes siempre cerca.',
    description: 'Una agenda conversacional para coordinar clientes, profesionales y servicios desde un solo espacio.',
    welcome: 'Bienvenido a Agenda Inteligente', welcomeText: 'Ingresa para gestionar tus reservas, recordatorios y seguimiento de clientes.',
    metrics: [['Voz', 'Reservas mediante conversación natural'], ['Agenda', 'Disponibilidad y citas organizadas'], ['WhatsApp', 'Recordatorios preparados en segundos']]
  },
  'serve-ai': {
    product: 'QUIRU Serve AI', badge: 'CARTA · PEDIDOS · VOZ', accent: '#00aebe',
    headline: 'Tu establecimiento, atendido con Inteligencia Artificial.',
    description: 'Configura tu carta, precios, combos y pedidos desde un espacio propio conectado a QUIRU Serve AI.',
    welcome: 'Bienvenido a QUIRU Serve AI', welcomeText: 'Ingresa para gestionar el establecimiento asignado a tu cuenta.',
    metrics: [['Carta', 'Productos, precios y disponibilidad'], ['Voz', 'Pedidos mediante conversación natural'], ['Cocina', 'Seguimiento de pedidos en tiempo real']]
  }
})

const brand = computed(() => BRANDING[props.requiredModule] || BRANDING.platform)
const authStyle = computed(() => ({ '--auth-accent': brand.value.accent }))
const user = ref(null)
const access = ref(null)
const loading = ref(true)
const submitting = ref(false)
const refreshingAccess = ref(false)
const error = ref('')
const message = ref('')
const view = ref('login')
const credentials = reactive({ email: '', password: '' })
const registration = reactive({ nombre: '', apellidoPaterno: '', apellidoMaterno: '', email: '', password: '', confirmation: '' })
const resetEmail = ref('')

const friendlyAuthError = cause => ({
  'auth/email-already-in-use': 'Este correo ya tiene una cuenta registrada.',
  'auth/invalid-credential': 'El correo o la contraseña no son correctos.',
  'auth/invalid-email': 'El correo electrónico no es válido.',
  'auth/popup-blocked': 'El navegador bloqueó la ventana de Google.',
  'auth/popup-closed-by-user': 'Se cerró la ventana de Google antes de completar el acceso.',
  'auth/too-many-requests': 'Se realizaron demasiados intentos. Inténtalo más tarde.',
  'auth/weak-password': 'La contraseña debe tener al menos 8 caracteres.'
}[cause?.code] || 'No fue posible completar la operación. Inténtalo nuevamente.')

const ensureUserProfile = currentUser => {
  const profile = { id: currentUser.uid, email: currentUser.email || '' }
  if (currentUser.displayName) profile.nombre = currentUser.displayName
  return setDoc(doc(firestore, 'usuario', currentUser.uid), profile, { merge: true })
}

const refreshAccess = async () => {
  if (!auth.currentUser || refreshingAccess.value) return
  refreshingAccess.value = true
  error.value = ''
  try {
    access.value = await loadUserAccess(auth.currentUser.uid)
  } catch (cause) {
    error.value = 'No fue posible actualizar tus accesos. Inténtalo nuevamente.'
    console.error(cause)
  } finally {
    refreshingAccess.value = false
  }
}

const refreshRestrictedAccessOnFocus = () => {
  if (user.value && props.requiredModule && !canAccessModule(access.value, props.requiredModule)) {
    refreshAccess()
  }
}

const unsubscribe = onAuthStateChanged(auth, async currentUser => {
  loading.value = true
  user.value = currentUser
  access.value = null
  error.value = ''
  if (currentUser) {
    try {
      await ensureUserProfile(currentUser)
      access.value = await loadUserAccess(currentUser.uid)
    } catch (cause) {
      error.value = 'No fue posible cargar tus accesos. Inténtalo nuevamente.'
      console.error(cause)
    }
  }
  loading.value = false
})
onBeforeUnmount(unsubscribe)
onMounted(() => window.addEventListener('focus', refreshRestrictedAccessOnFocus))
onBeforeUnmount(() => window.removeEventListener('focus', refreshRestrictedAccessOnFocus))

const changeView = nextView => { view.value = nextView; error.value = ''; message.value = '' }
const login = async () => {
  submitting.value = true; error.value = ''
  try { await signInWithEmailAndPassword(auth, credentials.email, credentials.password) }
  catch (cause) { error.value = friendlyAuthError(cause) }
  finally { submitting.value = false }
}
const loginWithGoogle = async () => {
  submitting.value = true; error.value = ''
  try { await signInWithPopup(auth, new GoogleAuthProvider()) }
  catch (cause) { error.value = friendlyAuthError(cause) }
  finally { submitting.value = false }
}
const createAccount = async () => {
  error.value = ''; message.value = ''
  if (registration.password !== registration.confirmation) { error.value = 'Las contraseñas no coinciden.'; return }
  if (registration.password.length < 8) { error.value = 'La contraseña debe tener al menos 8 caracteres.'; return }
  submitting.value = true
  try {
    const result = await createUserWithEmailAndPassword(auth, registration.email, registration.password)
    await setDoc(doc(firestore, 'usuario', result.user.uid), {
      id: result.user.uid, nombre: registration.nombre, apellidoPaterno: registration.apellidoPaterno,
      apellidoMaterno: registration.apellidoMaterno, email: registration.email,
      fechaIngreso: new Date().toISOString().slice(0, 10), requestedModule: props.requiredModule || 'platform'
    }, { merge: true })
    access.value = await loadUserAccess(result.user.uid)
  } catch (cause) { error.value = friendlyAuthError(cause) }
  finally { submitting.value = false }
}
const resetPassword = async () => {
  submitting.value = true; error.value = ''; message.value = ''
  try { await sendPasswordResetEmail(auth, resetEmail.value); message.value = 'Te enviamos un enlace para restablecer tu contraseña.' }
  catch (cause) { error.value = friendlyAuthError(cause) }
  finally { submitting.value = false }
}
const logout = () => signOut(auth)
</script>

<template>
  <main v-if="loading" class="auth-state"><p>Cargando QUIRU…</p></main>
  <main v-else-if="!user" class="auth-experience" :style="authStyle">
    <section class="auth-brand-sheet">
      <div class="auth-product-mark"><span class="auth-mark-icon">Q</span><div><strong>{{ brand.product }}</strong><small>BY QUIRU LABS</small></div></div>
      <span class="auth-brand-badge">{{ brand.badge }}</span>
      <h1>{{ brand.headline }}</h1><p>{{ brand.description }}</p>
      <div class="auth-voice-visual" aria-hidden="true"><span class="auth-mic"></span><i></i><i></i><i></i></div>
      <div class="auth-brand-metrics"><article v-for="metric in brand.metrics" :key="metric[0]"><strong>{{ metric[0] }}</strong><span>{{ metric[1] }}</span></article></div>
    </section>

    <section class="auth-form-area">
      <article v-if="view === 'login'" class="auth-flow-card">
        <header><span class="eyebrow">Acceso seguro</span><h2>{{ brand.welcome }}</h2><p>{{ brand.welcomeText }}</p></header>
        <form class="auth-form" @submit.prevent="login">
          <label>Correo electrónico<input v-model.trim="credentials.email" type="email" autocomplete="email" placeholder="tu@empresa.com" required></label>
          <label><span class="auth-label-row"><span>Contraseña</span><button type="button" @click="changeView('reset')">Olvidé mi contraseña</button></span><input v-model="credentials.password" type="password" autocomplete="current-password" placeholder="********" required></label>
          <p v-if="error" class="auth-alert error" role="alert">{{ error }}</p>
          <button class="button primary auth-main-action" :disabled="submitting" type="submit">{{ submitting ? 'Ingresando…' : 'Iniciar sesión' }}</button>
          <button class="button auth-outline-action" :disabled="submitting" type="button" @click="changeView('register')">Crear cuenta</button>
          <button class="auth-link auth-privacy-link" type="button" @click="changeView('privacy')">Política de privacidad</button>
        </form>
        <div class="auth-divider"><span>o continúa con</span></div>
        <button class="auth-google-button" :disabled="submitting" type="button" @click="loginWithGoogle"><strong>G</strong><span>Iniciar con Google</span></button>
      </article>

      <article v-else-if="view === 'register'" class="auth-flow-card">
        <header><span class="eyebrow">Nueva cuenta</span><h2>Crea tu cuenta</h2><p>Registra tus datos para comenzar en {{ brand.product }}.</p></header>
        <form class="auth-form" @submit.prevent="createAccount">
          <label>Nombre<input v-model.trim="registration.nombre" maxlength="40" autocomplete="given-name" required></label>
          <div class="auth-two-columns"><label>Apellido paterno<input v-model.trim="registration.apellidoPaterno" maxlength="30" autocomplete="family-name" required></label><label>Apellido materno<input v-model.trim="registration.apellidoMaterno" maxlength="30"></label></div>
          <label>Correo electrónico<input v-model.trim="registration.email" type="email" autocomplete="email" required></label>
          <div class="auth-two-columns"><label>Contraseña<input v-model="registration.password" type="password" minlength="8" autocomplete="new-password" required></label><label>Repetir contraseña<input v-model="registration.confirmation" type="password" minlength="8" autocomplete="new-password" required></label></div>
          <p class="auth-help">Usa al menos 8 caracteres.</p><p v-if="error" class="auth-alert error" role="alert">{{ error }}</p>
          <button class="button primary auth-main-action" :disabled="submitting" type="submit">{{ submitting ? 'Creando…' : 'Crear cuenta' }}</button>
          <button class="button auth-outline-action" type="button" @click="changeView('login')">Volver al inicio</button>
        </form>
      </article>

      <article v-else-if="view === 'reset'" class="auth-flow-card auth-compact-card">
        <header><span class="eyebrow">Recuperación segura</span><h2>Recupera tu contraseña</h2><p>Te enviaremos un enlace para establecer una nueva contraseña.</p></header>
        <form class="auth-form" @submit.prevent="resetPassword">
          <label>Correo electrónico<input v-model.trim="resetEmail" type="email" autocomplete="email" placeholder="tu@empresa.com" required></label>
          <p v-if="message" class="auth-alert success" role="status">{{ message }}</p><p v-if="error" class="auth-alert error" role="alert">{{ error }}</p>
          <button class="button primary auth-main-action" :disabled="submitting" type="submit">{{ submitting ? 'Enviando…' : 'Enviar enlace' }}</button>
          <button class="button auth-outline-action" type="button" @click="changeView('login')">Volver al inicio</button>
        </form>
      </article>

      <article v-else class="auth-flow-card auth-privacy-card">
        <header><span class="eyebrow">QUIRU LABS</span><h2>Política de privacidad</h2><p>Cómo protegemos y utilizamos tu información.</p></header>
        <div class="auth-policy-copy">
          <h3>Información que recopilamos</h3><p>Podemos solicitar datos de identificación y contacto, como nombre y correo electrónico, además de la información necesaria para prestar las funciones de cada producto.</p>
          <h3>Uso de la información</h3><p>Usamos los datos para mantener tu cuenta, habilitar los productos asignados, ofrecer soporte, mejorar nuestros servicios y proteger la seguridad de la plataforma.</p>
          <h3>Seguridad y acceso</h3><p>QUIRU LABS aplica controles técnicos y organizativos para prevenir accesos no autorizados. Cada usuario debe proteger sus credenciales y utilizar únicamente los módulos habilitados.</p>
          <h3>Cookies y servicios externos</h3><p>La plataforma puede usar almacenamiento del navegador y servicios de Firebase necesarios para autenticación, seguridad y funcionamiento.</p>
          <h3>Control de tus datos</h3><p>No vendemos ni cedemos información personal sin consentimiento, salvo obligación legal. Puedes solicitar corrección o eliminación de tus datos mediante los canales de QUIRU LABS.</p>
          <p>Esta política puede actualizarse para reflejar mejoras del producto o cambios normativos.</p>
        </div>
        <button class="button auth-outline-action" type="button" @click="changeView('login')">Volver al inicio</button>
      </article>
    </section>
  </main>

  <main v-else-if="requiredModule && access && !canAccessModule(access, requiredModule)" class="auth-page"><section class="auth-card"><p class="eyebrow">Acceso restringido</p><h1>No tienes acceso a este producto</h1><p class="muted">Si un administrador acaba de habilitar este módulo, actualiza tus accesos para continuar.</p><div class="access-identity"><strong>{{ user.email }}</strong><small>UID: {{ user.uid }}</small></div><p v-if="error" class="error" role="alert">{{ error }}</p><div class="actions"><button class="button primary" type="button" :disabled="refreshingAccess" @click="refreshAccess">{{ refreshingAccess ? 'Actualizando…' : 'Actualizar acceso' }}</button><a v-if="portalUrl" class="button secondary" :href="portalUrl">Ir al portal</a><button class="button secondary" type="button" @click="logout">Cerrar sesión</button></div></section></main>
  <main v-else-if="error" class="auth-page"><section class="auth-card"><p class="error" role="alert">{{ error }}</p><button class="button secondary" type="button" @click="logout">Cerrar sesión</button></section></main>
  <slot v-else :access="access" :logout="logout" :user="user" />
</template>

<style scoped>
.auth-experience { min-height: 100vh; display: grid; grid-template-columns: minmax(390px, 1fr) minmax(440px, 1fr); gap: clamp(24px, 4vw, 52px); padding: clamp(18px, 3vw, 42px); background: radial-gradient(circle at 8% 10%, color-mix(in srgb, var(--auth-accent) 12%, transparent), transparent 28%), #f5f7fb; }
.auth-brand-sheet { min-height: calc(100vh - clamp(36px, 6vw, 84px)); display: flex; flex-direction: column; justify-content: center; gap: 22px; padding: clamp(30px, 5vw, 58px); overflow: hidden; color: white; background: linear-gradient(145deg, #071b40 0%, #0b326c 50%, color-mix(in srgb, var(--auth-accent) 58%, #17205c)); border-radius: 32px; box-shadow: 0 28px 70px rgba(7,27,64,.22); }
.auth-product-mark { display: flex; align-items: center; gap: 12px; }.auth-product-mark > div { display: grid; }.auth-product-mark strong { font-size: 17px; }.auth-product-mark small { color: #bcd0ed; font-size: 10px; font-weight: 800; letter-spacing: .08em; }.auth-mark-icon { display: grid; width: 40px; height: 40px; place-items: center; border: 1px solid rgba(255,255,255,.25); border-radius: 12px; background: rgba(255,255,255,.1); font-weight: 850; }
.auth-brand-badge { align-self: flex-start; padding: 8px 13px; border-radius: 999px; color: #d7ebff; background: rgba(255,255,255,.12); font-size: 11px; font-weight: 800; letter-spacing: .04em; }.auth-brand-sheet h1 { max-width: 740px; margin: 0; font-size: clamp(38px, 5vw, 64px); line-height: 1.03; letter-spacing: -.045em; }.auth-brand-sheet > p { max-width: 650px; margin: 0; color: rgba(255,255,255,.78); line-height: 1.55; }
.auth-voice-visual { position: relative; display: grid; width: 94px; height: 94px; margin: 4px auto; place-items: center; border-radius: 50%; background: linear-gradient(135deg, #00d4ff, var(--auth-accent)); box-shadow: 0 0 0 12px rgba(0,212,255,.08), 0 18px 40px rgba(0,140,255,.28); }.auth-mic::before { content: ''; display: block; width: 18px; height: 30px; border: 3px solid white; border-radius: 10px; }.auth-voice-visual i { position: absolute; inset: -10px; border: 1px solid rgba(0,212,255,.34); border-radius: 50%; }.auth-voice-visual i:nth-of-type(2) { inset: -19px; opacity: .62; }.auth-voice-visual i:nth-of-type(3) { inset: -28px; opacity: .3; }
.auth-brand-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }.auth-brand-metrics article { padding: 17px; border: 1px solid rgba(255,255,255,.12); border-radius: 20px; background: rgba(255,255,255,.1); }.auth-brand-metrics strong, .auth-brand-metrics span { display: block; }.auth-brand-metrics span { margin-top: 7px; color: rgba(255,255,255,.72); font-size: 13px; line-height: 1.45; }
.auth-form-area { display: flex; align-items: center; justify-content: center; }.auth-flow-card { width: min(100%, 600px); max-height: calc(100vh - 48px); padding: clamp(28px, 4vw, 42px); overflow-y: auto; border: 1px solid #e0e7f0; border-radius: 22px; background: white; box-shadow: 0 18px 48px rgba(7,27,64,.09); }.auth-flow-card header { margin-bottom: 24px; }.auth-flow-card h2 { margin: 13px 0 8px; color: #071b40; font-size: clamp(30px, 4vw, 42px); line-height: 1.12; letter-spacing: -.035em; }.auth-flow-card header p { margin: 0; color: #52657f; line-height: 1.55; }
.auth-form { display: grid; gap: 14px; }.auth-form label { display: grid; gap: 8px; color: #152a4d; font-weight: 650; }.auth-form input { width: 100%; min-height: 46px; padding: 11px 13px; border: 1px solid #d8e0eb; border-radius: 12px; background: white; }.auth-form input:focus { outline: 3px solid color-mix(in srgb, var(--auth-accent) 18%, transparent); border-color: var(--auth-accent); }.auth-label-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.auth-label-row button, .auth-link { padding: 0; border: 0; color: #0075ff; background: transparent; font-weight: 750; cursor: pointer; }.auth-main-action { width: 100%; background: linear-gradient(135deg, #0066ff, var(--auth-accent))!important; }.auth-outline-action { width: 100%; border: 1px solid #7daeff; color: #0066ff; background: white; }.auth-privacy-link { justify-self: center; min-height: 28px; }.auth-two-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }.auth-help { margin: -5px 0 0; color: #6b7b91; font-size: 12px; }.auth-alert { margin: 0; padding: 11px 13px; border-radius: 10px; background: #fff1f2; }.auth-alert.success { background: #eaf8f0; }
.auth-divider { display: flex; align-items: center; gap: 12px; margin: 22px 0 14px; color: #65758b; font-size: 13px; }.auth-divider::before, .auth-divider::after { content: ''; height: 1px; flex: 1; background: #dde4ed; }.auth-google-button { width: 100%; min-height: 50px; display: flex; align-items: center; justify-content: center; gap: 12px; border: 1px solid #dce3ec; border-radius: 15px; color: #3c4043; background: white; box-shadow: 0 5px 14px rgba(7,27,64,.06); cursor: pointer; }.auth-google-button:disabled { opacity: .55; }.auth-google-button strong { font-size: 18px; }
.auth-compact-card { max-width: 540px; }.auth-privacy-card { max-width: 680px; }.auth-policy-copy { max-height: 390px; margin-bottom: 22px; padding-right: 10px; overflow-y: auto; color: #52657f; line-height: 1.55; }.auth-policy-copy h3 { margin: 22px 0 6px; color: #071b40; }.auth-policy-copy h3:first-child { margin-top: 0; }.auth-policy-copy p { margin-bottom: 10px; }
.access-identity { display: grid; gap: 4px; margin: 18px 0; padding: 12px 14px; border-radius: 12px; color: #152a4d; background: #eef4fc; }.access-identity small { color: #52657f; overflow-wrap: anywhere; }
@media (max-width: 980px) { .auth-experience { grid-template-columns: 1fr; }.auth-brand-sheet { min-height: auto; }.auth-brand-sheet h1 { font-size: clamp(34px, 7vw, 52px); }.auth-form-area { padding: 6px 0 30px; }.auth-flow-card { max-height: none; } }
@media (max-width: 620px) { .auth-experience { padding: 12px; }.auth-brand-sheet { padding: 26px 22px; border-radius: 24px; }.auth-brand-metrics, .auth-two-columns { grid-template-columns: 1fr; }.auth-voice-visual { display: none; }.auth-flow-card { padding: 25px 20px; }.auth-label-row { align-items: flex-start; flex-direction: column; gap: 5px; } }
</style>
