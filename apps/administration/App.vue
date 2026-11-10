<script setup>
import { computed, onMounted, ref } from 'vue'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import AuthGate from '../../packages/platform/src/components/AuthGate.vue'
import { firestore, functions } from '../../packages/platform/src/firebase.js'
import { MODULE_IDS, MODULES, SERVE_AI_MODULE } from '../../packages/platform/src/modules.js'
import { normalizeFeaturePermissions, normalizeModuleAssignments } from '../../packages/platform/src/authorization.js'

const portalUrl = import.meta.env.VITE_PORTAL_URL || (
  import.meta.env.DEV ? `http://${window.location.hostname}:4170/` : ''
)
const users = ref([])
const loadingUsers = ref(false)
const loadError = ref('')
const savedUserId = ref('')
const search = ref('')
const scopeFilter = ref('all')
const activeView = ref('profiles')
const authenticationUsers = ref([])
const loadingAuthentication = ref(false)
const authenticationError = ref('')
const authenticationSearch = ref('')
const creatingProfileUid = ref('')
const serveRestaurants = ref([])
const ADMIN_MODULES = Object.freeze([...new Map(
  [...MODULES, SERVE_AI_MODULE].map(module => [module.id, module])
).values()])

const enabledCount = moduleId => users.value.filter(user => user.moduleAssignments[moduleId]).length
const filteredUsers = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('es')
  return users.value.filter(user => {
    const matchesScope = scopeFilter.value === 'all' || user.assignmentScope === scopeFilter.value
    const haystack = [user.nombre, user.apellidoPaterno, user.apellidoMaterno, user.email, user.id]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('es')
    return matchesScope && (!term || haystack.includes(term))
  })
})
const filteredAuthenticationUsers = computed(() => {
  const term = authenticationSearch.value.trim().toLocaleLowerCase('es')
  return authenticationUsers.value.filter(user => {
    const haystack = [user.displayName, user.email, user.uid].filter(Boolean).join(' ').toLocaleLowerCase('es')
    return !term || haystack.includes(term)
  })
})
const missingProfilesCount = computed(() => authenticationUsers.value.filter(user => !user.profileExists).length)

const snapshotAssignments = assignments => Object.fromEntries(
  ADMIN_MODULES.map(module => [module.id, assignments[module.id] === true])
)

const assignmentsChanged = user => ADMIN_MODULES.some(
  module => user.moduleAssignments[module.id] !== user.savedAssignments[module.id]
) || user.featurePermissions.voice !== user.savedFeaturePermissions.voice
  || user.serveRestaurantId !== user.savedServeRestaurantId
  || (accessTargetUid(user) !== user.id && user.accessSavedToUid !== accessTargetUid(user))

const authenticationUserFor = managedUser => {
  const normalizedEmail = String(managedUser.email || '').trim().toLowerCase()
  return authenticationUsers.value.find(authenticationUser => authenticationUser.uid === managedUser.id) ||
    authenticationUsers.value.find(authenticationUser =>
      normalizedEmail && String(authenticationUser.email || '').trim().toLowerCase() === normalizedEmail)
}

const accessTargetUid = managedUser => authenticationUserFor(managedUser)?.uid || managedUser.id

const loadUsers = async () => {
  loadingUsers.value = true
  loadError.value = ''
  try {
    const snapshot = await getDocs(collection(firestore, 'usuario'))
    users.value = await Promise.all(snapshot.docs.map(async userDoc => {
        const profile = { ...userDoc.data(), id: userDoc.id }
        let membership = null
        if (profile.activeOrganizationId) {
          const membershipSnapshot = await getDoc(doc(
            firestore,
            'organizations',
            profile.activeOrganizationId,
            'members',
            profile.id
          ))
          if (membershipSnapshot.exists()) membership = membershipSnapshot.data()
        }
        return {
          ...profile,
          assignmentScope: membership ? 'organization' : 'profile',
          moduleAssignments: normalizeModuleAssignments(profile, membership),
          savedAssignments: snapshotAssignments(normalizeModuleAssignments(profile, membership)),
          featurePermissions: normalizeFeaturePermissions(profile, membership),
          savedFeaturePermissions: normalizeFeaturePermissions(profile, membership),
          serveRestaurantId: membership?.serveRestaurantId || profile.serveRestaurantId || '',
          savedServeRestaurantId: membership?.serveRestaurantId || profile.serveRestaurantId || '',
          accessSavedToUid: profile.id,
          saving: false,
          saveError: ''
        }
      }))
    users.value.sort((a, b) => (a.nombre || a.email || '').localeCompare(b.nombre || b.email || ''))
  } catch (cause) {
    loadError.value = 'No fue posible consultar los usuarios. Revisa los permisos de Firestore.'
    console.error(cause)
  } finally {
    loadingUsers.value = false
  }
}

const loadAuthenticationUsers = async () => {
  loadingAuthentication.value = true
  authenticationError.value = ''
  try {
    const callable = httpsCallable(functions, 'listAuthenticationUsers')
    const allUsers = []
    let pageToken = ''
    do {
      const response = await callable(pageToken ? { pageToken } : {})
      allUsers.push(...(response.data?.users || []))
      pageToken = response.data?.nextPageToken || ''
    } while (pageToken)
    authenticationUsers.value = allUsers.sort((a, b) =>
      (a.displayName || a.email || a.uid).localeCompare(b.displayName || b.email || b.uid))
  } catch (cause) {
    authenticationError.value = cause?.code === 'functions/not-found'
      ? 'La función de sincronización todavía no está desplegada.'
      : `No fue posible consultar Firebase Authentication. ${cause?.message || ''}`
    console.error(cause)
  } finally {
    loadingAuthentication.value = false
  }
}

const loadServeRestaurants = async () => {
  try {
    const response = await httpsCallable(functions, 'listServeRestaurants')({})
    serveRestaurants.value = response.data?.restaurants || []
  } catch (cause) {
    console.warn('No se pudieron cargar los establecimientos Serve AI.', cause)
    serveRestaurants.value = []
  }
}

const createProfile = async authenticationUser => {
  creatingProfileUid.value = authenticationUser.uid
  authenticationError.value = ''
  try {
    const callable = httpsCallable(functions, 'createUserProfileFromAuthentication')
    await callable({ uid: authenticationUser.uid })
    authenticationUser.profileExists = true
    await loadUsers()
  } catch (cause) {
    authenticationError.value = `No se pudo crear el perfil de ${authenticationUser.email || authenticationUser.uid}. ${cause?.message || ''}`
    console.error(cause)
  } finally {
    creatingProfileUid.value = ''
  }
}

const configureAuthenticationUser = authenticationUser => {
  activeView.value = 'profiles'
  scopeFilter.value = 'all'
  search.value = authenticationUser.uid
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const saveAssignments = async user => {
  user.saveError = ''
  savedUserId.value = ''
  user.saving = true
  try {
    const targetUid = accessTargetUid(user)
    const modules = Object.fromEntries(ADMIN_MODULES.map(module => [
      module.id,
      { enabled: user.moduleAssignments[module.id] === true }
    ]))
    const updateAssignments = httpsCallable(functions, 'updateUserModuleAssignments')
    const response = await updateAssignments({
      uid: targetUid,
      modules,
      features: { voice: { enabled: user.featurePermissions.voice === true } },
      serveRestaurantId: user.serveRestaurantId || ''
    })
    user.assignmentScope = response.data?.scope || user.assignmentScope
    user.savedAssignments = snapshotAssignments(user.moduleAssignments)
    user.savedFeaturePermissions = { voice: user.featurePermissions.voice === true }
    user.savedServeRestaurantId = user.serveRestaurantId || ''
    user.accessSavedToUid = targetUid
    savedUserId.value = user.id
  } catch (cause) {
    user.saveError = `No se pudieron guardar los accesos. ${cause?.message || ''}`
    console.error(cause)
  } finally {
    user.saving = false
  }
}

const discardChanges = user => {
  user.moduleAssignments = snapshotAssignments(user.savedAssignments)
  user.featurePermissions = { voice: user.savedFeaturePermissions.voice === true }
  user.serveRestaurantId = user.savedServeRestaurantId || ''
  user.saveError = ''
}

const refreshAll = () => Promise.all([loadUsers(), loadAuthenticationUsers(), loadServeRestaurants()])

onMounted(refreshAll)
</script>

<template>
  <AuthGate
    v-slot="{ access, logout, user: currentUser }"
    :portal-url="portalUrl"
    :required-module="MODULE_IDS.ADMINISTRATION"
  >
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">Administración <small>QUIRU LABS</small></div>
        <div class="actions">
          <a v-if="portalUrl" class="button secondary" :href="portalUrl">Productos</a>
          <button class="button secondary" type="button" @click="logout">Cerrar sesión</button>
        </div>
      </header>

      <section class="content">
        <div class="page-heading">
          <div><p class="eyebrow">Accesos por producto</p><h1>Usuarios y módulos</h1><p class="muted">Activa solamente los productos que cada usuario puede utilizar.</p></div>
          <button class="button secondary" type="button" :disabled="loadingUsers || loadingAuthentication" @click="refreshAll">Actualizar usuarios</button>
        </div>
        <p class="notice">Las cuentas antiguas mantienen Odontología hasta guardar una asignación explícita. Los cambios se aplican cuando el usuario vuelve a iniciar sesión.</p>
        <p v-if="loadError" class="error" role="alert">{{ loadError }}</p>

        <div class="admin-metrics">
          <article><strong>{{ users.length }}</strong><span>Usuarios registrados</span></article>
          <article class="metric-warning"><strong>{{ missingProfilesCount }}</strong><span>Sin perfil en usuario</span></article>
          <article><strong>{{ enabledCount(MODULE_IDS.DENTISTRY) }}</strong><span>Con Odontología</span></article>
          <article><strong>{{ enabledCount(MODULE_IDS.SMART_AGENDA) }}</strong><span>Con Agenda inteligente</span></article>
          <article><strong>{{ enabledCount(MODULE_IDS.SERVE_AI) }}</strong><span>Con QUIRU Serve AI</span></article>
        </div>

        <div class="view-tabs" role="tablist" aria-label="Origen de usuarios">
          <button type="button" :class="{ active: activeView === 'profiles' }" @click="activeView = 'profiles'">Perfiles de usuario ({{ users.length }})</button>
          <button type="button" :class="{ active: activeView === 'authentication' }" @click="activeView = 'authentication'">Firebase Authentication ({{ authenticationUsers.length }})</button>
        </div>

        <div v-if="activeView === 'profiles'" class="filters panel">
          <label>Buscar usuario<input v-model="search" class="field" type="search" placeholder="Nombre, correo o UID"></label>
          <label>Origen del acceso<select v-model="scopeFilter" class="field"><option value="all">Todos</option><option value="profile">Perfil individual</option><option value="organization">Organización</option></select></label>
        </div>

        <div v-else class="filters panel auth-filter">
          <label>Buscar en Authentication<input v-model="authenticationSearch" class="field" type="search" placeholder="Nombre, correo o UID"></label>
          <p>Las cuentas sin perfil pueden agregarse a la colección <code>usuario</code>.</p>
        </div>

        <p v-if="activeView === 'profiles' && loadingUsers" class="loading-state">Cargando usuarios…</p>

        <div v-else-if="activeView === 'profiles'" class="users-list">
          <article v-for="managedUser in filteredUsers" :key="managedUser.id" class="user-card" :class="{ changed: assignmentsChanged(managedUser) }">
            <div class="user-heading">
              <div>
                <h2>{{ [managedUser.nombre, managedUser.apellidoPaterno].filter(Boolean).join(' ') || managedUser.email || 'Usuario sin nombre' }}</h2>
                <p class="muted">{{ managedUser.email || 'Sin correo' }}</p>
                <small class="user-uid">UID/documento: {{ managedUser.id }}</small>
                <small v-if="accessTargetUid(managedUser) !== managedUser.id" class="uid-correction">UID de Authentication: {{ accessTargetUid(managedUser) }} · los accesos se guardarán aquí</small>
              </div>
              <div class="badges"><span class="scope">{{ managedUser.assignmentScope === 'organization' ? 'Organización' : 'Perfil' }}</span><span v-if="managedUser.rol" class="role">{{ managedUser.rol }}</span></div>
            </div>

            <fieldset>
              <legend>Productos habilitados</legend>
              <p v-if="managedUser.assignmentScope === 'organization'" class="muted scope-note">
                Acceso aplicado a su organización activa.
              </p>
              <label v-for="module in ADMIN_MODULES" :key="module.id" class="module-toggle">
                <input
                  v-model="managedUser.moduleAssignments[module.id]"
                  type="checkbox"
                  :disabled="managedUser.id === currentUser.uid && module.id === MODULE_IDS.ADMINISTRATION"
                >
                <span><strong>{{ module.name }}</strong><small>{{ module.description }}</small></span>
              </label>
            </fieldset>

            <fieldset>
              <legend>Funciones adicionales</legend>
              <label class="module-toggle">
                <input v-model="managedUser.featurePermissions.voice" type="checkbox">
                <span><strong>Uso de voz e Inteligencia Artificial</strong><small>Muestra los controles de micrófono y asistentes conversacionales.</small></span>
              </label>
              <label v-if="managedUser.moduleAssignments[MODULE_IDS.SERVE_AI]" class="serve-assignment">
                Establecimiento de QUIRU Serve AI
                <select v-model="managedUser.serveRestaurantId" class="field">
                  <option value="">Sin asignar · lo configurará en Serve AI</option>
                  <option v-for="restaurant in serveRestaurants" :key="restaurant.id" :value="restaurant.id">{{ restaurant.name }}</option>
                </select>
                <small>Déjalo sin asignar para que el usuario cree su restaurante al ingresar a Serve AI, o vincúlalo a uno existente.</small>
              </label>
            </fieldset>

            <div class="save-row">
              <div><span v-if="savedUserId === managedUser.id" class="success">Accesos guardados.</span><span v-else-if="managedUser.saveError" class="error" role="alert">{{ managedUser.saveError }}</span><span v-else-if="assignmentsChanged(managedUser)" class="pending">Cambios sin guardar</span></div>
              <div class="card-actions"><button v-if="assignmentsChanged(managedUser)" class="button secondary" type="button" :disabled="managedUser.saving" @click="discardChanges(managedUser)">Descartar</button><button class="button primary" type="button" :disabled="managedUser.saving || loadingAuthentication || !assignmentsChanged(managedUser)" @click="saveAssignments(managedUser)">{{ managedUser.saving ? 'Guardando…' : loadingAuthentication ? 'Validando UID…' : 'Guardar accesos' }}</button></div>
            </div>
          </article>
          <div v-if="!filteredUsers.length" class="empty-state"><strong>No se encontraron usuarios</strong><p>Prueba con otro nombre, correo o filtro.</p></div>
        </div>

        <div v-else class="auth-users-section">
          <p v-if="authenticationError" class="error" role="alert">{{ authenticationError }}</p>
          <p v-if="loadingAuthentication" class="loading-state">Consultando Firebase Authentication…</p>
          <div v-else class="auth-users-list">
            <article v-for="authenticationUser in filteredAuthenticationUsers" :key="authenticationUser.uid" class="auth-user-card">
              <div><strong>{{ authenticationUser.displayName || authenticationUser.email || 'Cuenta sin nombre' }}</strong><p>{{ authenticationUser.email || 'Sin correo' }}</p><small>UID: {{ authenticationUser.uid }}</small></div>
              <div class="auth-user-actions">
                <span v-if="authenticationUser.disabled" class="disabled-badge">Deshabilitado</span>
                <span v-if="authenticationUser.profileExists" class="success-badge">Perfil registrado</span>
                <button v-if="authenticationUser.profileExists" class="button secondary" type="button" @click="configureAuthenticationUser(authenticationUser)">Configurar accesos</button>
                <button v-else class="button primary" type="button" :disabled="creatingProfileUid === authenticationUser.uid" @click="createProfile(authenticationUser)">{{ creatingProfileUid === authenticationUser.uid ? 'Creando…' : 'Crear en usuario' }}</button>
              </div>
            </article>
            <div v-if="!filteredAuthenticationUsers.length" class="empty-state"><strong>No se encontraron cuentas</strong><p>Prueba con otro nombre, correo o UID.</p></div>
          </div>
        </div>
      </section>
    </div>
  </AuthGate>
</template>
