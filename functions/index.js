const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { FieldValue, getFirestore } = require('firebase-admin/firestore')
const { HttpsError, onCall } = require('firebase-functions/v2/https')

initializeApp()

const db = getFirestore()
const SUPER_ADMIN_UIDS = new Set([
  'n4E2YxosBwhmk3OgkoZOW6eX4nz2'
])
const administrationEnabled = modules =>
  modules?.['user-admin'] === true || modules?.['user-admin']?.enabled === true

async function assertAdministrator(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')

  const profileSnapshot = await db.doc(`usuario/${request.auth.uid}`).get()
  if (SUPER_ADMIN_UIDS.has(request.auth.uid)) {
    await db.doc(`usuario/${request.auth.uid}`).set({
      id: request.auth.uid,
      email: request.auth.token.email || profileSnapshot.data()?.email || '',
      modules: {
        'user-admin': { enabled: true }
      },
      accessUpdatedAt: FieldValue.serverTimestamp(),
      accessUpdatedBy: request.auth.uid
    }, { merge: true })
    return
  }

  if (!profileSnapshot.exists) throw new HttpsError('permission-denied', 'Tu perfil administrativo no existe.')
  const profile = profileSnapshot.data()
  let modules = profile.modules

  if (profile.activeOrganizationId) {
    const membership = await db.doc(
      `organizations/${profile.activeOrganizationId}/members/${request.auth.uid}`
    ).get()
    if (membership.exists && membership.data().modules) modules = membership.data().modules
  }

  if (!administrationEnabled(modules) && profile.rol !== 'admin') {
    throw new HttpsError('permission-denied', 'No tienes permiso para administrar usuarios.')
  }
}

exports.listAuthenticationUsers = onCall(async request => {
  await assertAdministrator(request)
  const pageToken = typeof request.data?.pageToken === 'string' ? request.data.pageToken : undefined
  const result = await getAuth().listUsers(1000, pageToken)
  const references = result.users.map(user => db.doc(`usuario/${user.uid}`))
  const profiles = references.length ? await db.getAll(...references) : []

  return {
    users: result.users.map((user, index) => ({
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      disabled: user.disabled,
      providers: user.providerData.map(provider => provider.providerId),
      creationTime: user.metadata.creationTime || '',
      lastSignInTime: user.metadata.lastSignInTime || '',
      profileExists: profiles[index]?.exists === true
    })),
    nextPageToken: result.pageToken || ''
  }
})

exports.createUserProfileFromAuthentication = onCall(async request => {
  await assertAdministrator(request)
  const uid = typeof request.data?.uid === 'string' ? request.data.uid.trim() : ''
  if (!uid) throw new HttpsError('invalid-argument', 'El UID es obligatorio.')

  const authUser = await getAuth().getUser(uid)
  const profileRef = db.doc(`usuario/${uid}`)
  const existing = await profileRef.get()
  if (existing.exists) return { created: false, reason: 'already-exists' }

  await profileRef.create({
    id: uid,
    email: authUser.email || '',
    nombre: authUser.displayName || '',
    estado: !authUser.disabled,
    fechaIngreso: new Date().toISOString().slice(0, 10),
    authProviders: authUser.providerData.map(provider => provider.providerId),
    profileSource: 'firebase-authentication',
    modules: {
      'user-admin': { enabled: false },
      dentistry: { enabled: false },
      'smart-agenda': { enabled: false },
      'serve-ai': { enabled: false }
    },
    features: { voice: { enabled: false } },
    createdAt: FieldValue.serverTimestamp(),
    createdBy: request.auth.uid
  })

  return { created: true }
})

exports.updateUserModuleAssignments = onCall(async request => {
  await assertAdministrator(request)
  const uid = typeof request.data?.uid === 'string' ? request.data.uid.trim() : ''
  if (!uid) throw new HttpsError('invalid-argument', 'El UID es obligatorio.')

  const authUser = await getAuth().getUser(uid)
  const requestedModules = request.data?.modules || {}
  const modules = {
    'user-admin': { enabled: requestedModules['user-admin']?.enabled === true },
    dentistry: { enabled: requestedModules.dentistry?.enabled === true },
    'smart-agenda': { enabled: requestedModules['smart-agenda']?.enabled === true },
    'serve-ai': { enabled: requestedModules['serve-ai']?.enabled === true }
  }
  const features = {
    voice: { enabled: request.data?.features?.voice?.enabled === true }
  }
  const serveRestaurantId = typeof request.data?.serveRestaurantId === 'string'
    ? request.data.serveRestaurantId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60)
    : ''
  const profileRef = db.doc(`usuario/${uid}`)
  const profileSnapshot = await profileRef.get()
  const profile = profileSnapshot.exists ? profileSnapshot.data() : {}

  await profileRef.set({
    id: uid,
    email: authUser.email || profile.email || '',
    nombre: profile.nombre || authUser.displayName || '',
    accessUpdatedAt: FieldValue.serverTimestamp(),
    accessUpdatedBy: request.auth.uid,
    ...(profile.activeOrganizationId ? {} : { modules, features, serveRestaurantId })
  }, { merge: true })

  if (profile.activeOrganizationId) {
    await db.doc(`organizations/${profile.activeOrganizationId}/members/${uid}`).set({
      modules,
      features,
      serveRestaurantId,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid
    }, { merge: true })
  }

  return {
    updated: true,
    uid,
    scope: profile.activeOrganizationId ? 'organization' : 'profile'
  }
})

Object.assign(exports, require('./serve.js')(assertAdministrator))
Object.assign(exports, require('./notifications')(db))
