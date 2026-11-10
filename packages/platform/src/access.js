import { doc, getDoc } from 'firebase/firestore'
import { firestore } from './firebase.js'
import { normalizeFeaturePermissions, normalizeModuleAssignments } from './authorization.js'
import { MODULE_IDS } from './modules.js'

// Cuentas propietarias que pueden recuperar el acceso inicial al módulo de
// administración. El backend valida la misma lista antes de permitir cambios.
const SUPER_ADMIN_UIDS = new Set([
  'n4E2YxosBwhmk3OgkoZOW6eX4nz2'
])

export const loadUserAccess = async uid => {
  const profileSnapshot = await getDoc(doc(firestore, 'usuario', uid))
  const profile = profileSnapshot.exists()
    ? { ...profileSnapshot.data(), id: profileSnapshot.id }
    : { id: uid, modules: {} }

  let membership = null
  if (profile.activeOrganizationId) {
    const membershipSnapshot = await getDoc(doc(
      firestore,
      'organizations',
      profile.activeOrganizationId,
      'members',
      uid
    ))
    if (membershipSnapshot.exists()) {
      membership = { ...membershipSnapshot.data(), id: membershipSnapshot.id }
    }
  }

  const modules = normalizeModuleAssignments(profile, membership)
  const features = normalizeFeaturePermissions(profile, membership)
  const isSuperAdministrator = SUPER_ADMIN_UIDS.has(uid)
  const localBootstrapEnabled = import.meta.env.DEV &&
    String(import.meta.env.VITE_MODULE_ACCESS_DEV_BYPASS).toLowerCase() === 'true'

  if (isSuperAdministrator) {
    modules[MODULE_IDS.ADMINISTRATION] = true
    features.voice = true
  }

  if (localBootstrapEnabled) {
    modules[MODULE_IDS.ADMINISTRATION] = true
    modules[MODULE_IDS.DENTISTRY] = true
    modules[MODULE_IDS.SMART_AGENDA] = true
    modules[MODULE_IDS.SERVE_AI] = true
    features.voice = true
  }

  return {
    profile,
    membership,
    organizationId: profile.activeOrganizationId || null,
    serveRestaurantId: membership?.serveRestaurantId || profile.serveRestaurantId || '',
    modules,
    features,
    isSuperAdministrator,
    localBootstrapEnabled
  }
}
