const { randomUUID } = require('node:crypto')
const { FieldValue, getFirestore } = require('firebase-admin/firestore')
const { HttpsError, onCall } = require('firebase-functions/v2/https')

const db = getFirestore()
const ORDER_STATUSES = ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED']
const STATUS_TRANSITIONS = {
  RECEIVED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: []
}

const slug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60)
const text = (value, max = 200) => String(value || '').trim().slice(0, max)
const stringArray = (value, limit = 20) => Array.isArray(value)
  ? value.filter(item => typeof item === 'string').map(item => text(item, 80)).filter(Boolean).slice(0, limit)
  : []
const plainArray = (value, limit = 20) => Array.isArray(value)
  ? JSON.parse(JSON.stringify(value.slice(0, limit)))
  : []
const timestampValue = value => value?.toDate?.()?.toISOString?.() || value || null

function serialize(snapshot) {
  const data = snapshot.data()
  return {
    ...data,
    id: snapshot.id,
    createdAt: timestampValue(data.createdAt),
    updatedAt: timestampValue(data.updatedAt)
  }
}

function sanitizeRestaurant(input = {}) {
  const id = slug(input.id)
  if (!id || !text(input.name, 100)) throw new HttpsError('invalid-argument', 'El restaurante y su nombre son obligatorios.')
  const orderingMode = input.orderingMode === 'ONLINE' ? 'ONLINE' : 'TABLE'
  const categories = plainArray(input.categories, 30).map((category, index) => ({
    id: slug(category.id), name: text(category.name, 60), order: Number.isInteger(Number(category.order)) ? Number(category.order) : index + 1
  })).filter(category => category.id && category.name)
  return {
    id,
    name: text(input.name, 100),
    description: text(input.description, 500),
    currency: /^[A-Z]{3}$/.test(String(input.currency || '')) ? input.currency : 'PEN',
    locale: text(input.locale || 'es-PE', 15),
    timezone: text(input.timezone || 'America/Lima', 60),
    orderingMode,
    active: input.active !== false,
    contact: {
      address: text(input.contact?.address, 180),
      phone: text(input.contact?.phone, 30),
      whatsapp: text(input.contact?.whatsapp, 30)
    },
    businessHours: text(input.businessHours, 300),
    branding: {
      primaryColor: /^#[0-9a-f]{6}$/i.test(input.branding?.primaryColor || '') ? input.branding.primaryColor : '#063f67',
      accentColor: /^#[0-9a-f]{6}$/i.test(input.branding?.accentColor || '') ? input.branding.accentColor : '#00c7d9',
      logo: text(input.branding?.logo, 300)
    },
    conversation: {
      assistantName: text(input.conversation?.assistantName || 'QUIRU', 30),
      language: text(input.conversation?.language || 'es-PE', 15),
      welcomeMessage: text(input.conversation?.welcomeMessage || 'Hola. ¿Qué te gustaría pedir?', 180),
      maxSessionMinutes: Math.min(30, Math.max(1, Number(input.conversation?.maxSessionMinutes || 10))),
      inactivityTimeoutSeconds: Math.min(300, Math.max(20, Number(input.conversation?.inactivityTimeoutSeconds || 90))),
      maxUpsellsPerOrder: Math.min(3, Math.max(0, Number(input.conversation?.maxUpsellsPerOrder || 1))),
      responseStyle: 'short',
      voiceEnabled: input.conversation?.voiceEnabled !== false
    },
    ui: {
      tagline: text(input.ui?.tagline || 'Habla. Pide. Disfruta.', 80),
      showAllergens: input.ui?.showAllergens !== false,
      defaultCategory: slug(input.ui?.defaultCategory)
    },
    categories,
    upsellRules: plainArray(input.upsellRules, 20).map(rule => ({
      triggerProductId: slug(rule.triggerProductId), suggestProductId: slug(rule.suggestProductId)
    })).filter(rule => rule.triggerProductId && rule.suggestProductId)
  }
}

function sanitizeProduct(input = {}) {
  const id = slug(input.id)
  const restaurantId = slug(input.restaurantId)
  const price = Number(input.price)
  if (!id || !restaurantId || !text(input.name, 100)) throw new HttpsError('invalid-argument', 'Restaurante, producto y nombre son obligatorios.')
  if (!Number.isInteger(price) || price < 0 || price > 10000000) throw new HttpsError('invalid-argument', 'El precio debe estar en céntimos.')
  const ingredients = plainArray(input.ingredients, 40).map(ingredient => ({
    id: slug(ingredient.id), name: text(ingredient.name, 80), removable: ingredient.removable === true
  })).filter(ingredient => ingredient.id && ingredient.name)
  const modifierGroups = plainArray(input.modifierGroups, 15).map(group => ({
    id: slug(group.id), name: text(group.name, 80), type: group.type === 'multiple' ? 'multiple' : 'single',
    required: group.required === true,
    maxSelections: Math.min(10, Math.max(1, Number(group.maxSelections || (group.type === 'multiple' ? 10 : 1)))),
    options: plainArray(group.options, 30).map(option => ({
      id: slug(option.id), name: text(option.name, 80), aliases: stringArray(option.aliases),
      priceDelta: Number.isInteger(Number(option.priceDelta)) ? Number(option.priceDelta) : 0,
      available: option.available !== false, default: option.default === true
    })).filter(option => option.id && option.name)
  })).filter(group => group.id && group.name && group.options.length)
  const product = {
    id, restaurantId, categoryId: slug(input.categoryId), name: text(input.name, 100),
    aliases: stringArray(input.aliases), description: text(input.description, 500), price,
    available: input.available !== false, archived: input.archived === true,
    ingredients, modifierGroups, allergens: stringArray(input.allergens),
    productType: input.productType === 'combo' ? 'combo' : 'product',
    comboItems: plainArray(input.comboItems, 30).map(item => ({
      productId: slug(item.productId), quantity: Math.min(20, Math.max(1, Math.round(Number(item.quantity || 1))))
    })).filter(item => item.productId)
  }
  if (product.productType === 'combo' && !product.comboItems.length) {
    throw new HttpsError('invalid-argument', 'Un combo debe incluir al menos un producto.')
  }
  return product
}

function validateOrderItem(product, requested = {}, catalog = new Map()) {
  const quantity = Number(requested.quantity)
  if (!product || product.archived || !product.available) throw new HttpsError('failed-precondition', `${product?.name || 'El producto'} no está disponible.`)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new HttpsError('invalid-argument', 'Cantidad inválida.')
  const modifierIds = new Set(stringArray(requested.modifierIds, 30))
  const modifiers = []
  for (const group of product.modifierGroups || []) {
    const selected = (group.options || []).filter(option => modifierIds.has(option.id))
    if (group.required && !selected.length) throw new HttpsError('failed-precondition', `Falta elegir ${group.name} para ${product.name}.`)
    if (group.type === 'single' && selected.length > 1) throw new HttpsError('failed-precondition', `Solo puedes elegir una opción en ${group.name}.`)
    if (selected.length > Number(group.maxSelections || 10)) throw new HttpsError('failed-precondition', `Demasiadas opciones en ${group.name}.`)
    for (const option of selected) {
      if (!option.available) throw new HttpsError('failed-precondition', `${option.name} no está disponible.`)
      modifiers.push({ id: option.id, groupId: group.id, name: option.name, priceDelta: Number(option.priceDelta || 0) })
    }
  }
  if (modifiers.length !== modifierIds.size) throw new HttpsError('failed-precondition', 'El pedido contiene un modificador no permitido.')
  const removalIds = new Set(stringArray(requested.removeIngredientIds, 30))
  const removeIngredients = (product.ingredients || []).filter(ingredient => removalIds.has(ingredient.id) && ingredient.removable)
  if (removeIngredients.length !== removalIds.size) throw new HttpsError('failed-precondition', 'El pedido intenta retirar un ingrediente no permitido.')
  const unitPrice = Number(product.price) + modifiers.reduce((sum, modifier) => sum + modifier.priceDelta, 0)
  const comboItems = product.productType === 'combo'
    ? (product.comboItems || []).map(item => ({
        productId: item.productId,
        name: catalog.get(item.productId)?.name || item.productId,
        quantity: Number(item.quantity || 1)
      }))
    : []
  return {
    productId: product.id, name: product.name, quantity, basePrice: product.price,
    modifiers, removeIngredients: removeIngredients.map(item => ({ id: item.id, name: item.name })),
    unitPrice, lineTotal: unitPrice * quantity, allergens: product.allergens || [],
    productType: product.productType || 'product', comboItems
  }
}

module.exports = function createServeFunctions(assertAdministrator) {
  async function assertServeManager(request, allowUnassigned = false) {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
    const profileSnapshot = await db.doc(`usuario/${request.auth.uid}`).get()
    if (!profileSnapshot.exists) throw new HttpsError('permission-denied', 'Tu perfil no existe.')
    const profile = profileSnapshot.data()
    let access = profile
    let assignmentRef = profileSnapshot.ref
    if (profile.activeOrganizationId) {
      const membership = await db.doc(`organizations/${profile.activeOrganizationId}/members/${request.auth.uid}`).get()
      if (membership.exists) {
        access = { ...profile, ...membership.data() }
        assignmentRef = membership.ref
      }
    }
    const serveEnabled = access.modules?.['serve-ai'] === true || access.modules?.['serve-ai']?.enabled === true
    if (!serveEnabled) throw new HttpsError('permission-denied', 'No tienes acceso a QUIRU Serve AI.')
    const restaurantId = slug(access.serveRestaurantId)
    if (!restaurantId && !allowUnassigned) throw new HttpsError('failed-precondition', 'Primero configura el restaurante de tu espacio Serve AI.')
    return { uid: request.auth.uid, restaurantId, assignmentRef }
  }

  const getServeRestaurantCatalog = onCall(async request => {
    const restaurantId = slug(request.data?.restaurantId)
    if (!restaurantId) throw new HttpsError('invalid-argument', 'El restaurante es obligatorio.')
    const restaurantSnapshot = await db.doc(`serveRestaurants/${restaurantId}`).get()
    if (!restaurantSnapshot.exists || restaurantSnapshot.data().active === false) throw new HttpsError('not-found', 'Restaurante no disponible.')
    const productsSnapshot = await db.collection(`serveRestaurants/${restaurantId}/products`).get()
    const restaurant = serialize(restaurantSnapshot)
    delete restaurant.updatedBy
    const products = productsSnapshot.docs.map(serialize).filter(product => !product.archived).map(product => {
      const publicProduct = { ...product }
      delete publicProduct.updatedBy
      return publicProduct
    })
    return { restaurant, products }
  })

  const createServeOrder = onCall({ enforceAppCheck: true }, async request => {
    const restaurantId = slug(request.data?.restaurantId)
    const clientOrderId = slug(request.data?.clientOrderId)
    const requestedItems = Array.isArray(request.data?.items) ? request.data.items.slice(0, 50) : []
    if (!restaurantId || !clientOrderId || !requestedItems.length) throw new HttpsError('invalid-argument', 'El pedido está incompleto.')
    const restaurantSnapshot = await db.doc(`serveRestaurants/${restaurantId}`).get()
    if (!restaurantSnapshot.exists || restaurantSnapshot.data().active === false) throw new HttpsError('not-found', 'Restaurante no disponible.')
    const restaurant = restaurantSnapshot.data()
    const productIds = [...new Set(requestedItems.map(item => slug(item.productId)).filter(Boolean))]
    const productSnapshots = productIds.length ? await db.getAll(...productIds.map(id => db.doc(`serveRestaurants/${restaurantId}/products/${id}`))) : []
    const products = new Map(productSnapshots.filter(snapshot => snapshot.exists).map(snapshot => [snapshot.id, snapshot.data()]))
    const componentIds = [...new Set([...products.values()].flatMap(product =>
      product.productType === 'combo' ? (product.comboItems || []).map(item => slug(item.productId)) : []
    ).filter(id => id && !products.has(id)))]
    const componentSnapshots = componentIds.length
      ? await db.getAll(...componentIds.map(id => db.doc(`serveRestaurants/${restaurantId}/products/${id}`)))
      : []
    componentSnapshots.filter(snapshot => snapshot.exists).forEach(snapshot => products.set(snapshot.id, snapshot.data()))
    const items = requestedItems.map(item => validateOrderItem(products.get(slug(item.productId)), item, products))
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
    const publicToken = randomUUID()
    const orderRef = db.doc(`serveRestaurants/${restaurantId}/orders/${clientOrderId}`)
    const result = await db.runTransaction(async transaction => {
      const existing = await transaction.get(orderRef)
      if (existing.exists) {
        const order = existing.data()
        return { id: existing.id, publicToken: order.publicToken, status: order.status, total: order.total, created: false }
      }
      const order = {
        id: clientOrderId, restaurantId, restaurantName: restaurant.name,
        mode: restaurant.orderingMode === 'ONLINE' ? 'ONLINE' : 'TABLE',
        table: text(request.data?.table, 20), items, subtotal, total: subtotal,
        currency: restaurant.currency || 'PEN', status: 'RECEIVED', publicToken,
        source: request.data?.source === 'voice' ? 'voice' : 'manual',
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        timeline: [{ status: 'RECEIVED', at: new Date().toISOString(), actor: 'customer' }]
      }
      transaction.create(orderRef, order)
      return { id: clientOrderId, publicToken, status: 'RECEIVED', total: subtotal, created: true }
    })
    return result
  })

  const getServeOrderStatus = onCall(async request => {
    const restaurantId = slug(request.data?.restaurantId)
    const orderId = slug(request.data?.orderId)
    const token = text(request.data?.publicToken, 80)
    const snapshot = await db.doc(`serveRestaurants/${restaurantId}/orders/${orderId}`).get()
    if (!snapshot.exists || !token || snapshot.data().publicToken !== token) throw new HttpsError('not-found', 'Pedido no encontrado.')
    const order = snapshot.data()
    return { id: snapshot.id, status: order.status, total: order.total, currency: order.currency, updatedAt: timestampValue(order.updatedAt) }
  })

  const listServeRestaurants = onCall(async request => {
    await assertAdministrator(request)
    const snapshot = await db.collection('serveRestaurants').get()
    return { restaurants: snapshot.docs.map(serialize).sort((a, b) => a.name.localeCompare(b.name)) }
  })

  const getServeAdministrationCatalog = onCall(async request => {
    await assertAdministrator(request)
    const restaurantId = slug(request.data?.restaurantId)
    const restaurant = await db.doc(`serveRestaurants/${restaurantId}`).get()
    if (!restaurant.exists) throw new HttpsError('not-found', 'Restaurante no encontrado.')
    const products = await db.collection(`serveRestaurants/${restaurantId}/products`).get()
    return { restaurant: serialize(restaurant), products: products.docs.map(serialize) }
  })

  const saveServeRestaurant = onCall(async request => {
    await assertAdministrator(request)
    const restaurant = sanitizeRestaurant(request.data?.restaurant)
    await db.doc(`serveRestaurants/${restaurant.id}`).set({
      ...restaurant, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid
    }, { merge: true })
    return { restaurantId: restaurant.id }
  })

  const saveServeProduct = onCall(async request => {
    await assertAdministrator(request)
    const product = sanitizeProduct(request.data?.product)
    await db.doc(`serveRestaurants/${product.restaurantId}/products/${product.id}`).set({
      ...product, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid
    }, { merge: true })
    return { productId: product.id }
  })

  const archiveServeProduct = onCall(async request => {
    await assertAdministrator(request)
    const restaurantId = slug(request.data?.restaurantId)
    const productId = slug(request.data?.productId)
    if (!restaurantId || !productId) throw new HttpsError('invalid-argument', 'Producto incompleto.')
    await db.doc(`serveRestaurants/${restaurantId}/products/${productId}`).set({
      archived: true, available: false, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid
    }, { merge: true })
    return { archived: true }
  })

  const listServeOrders = onCall(async request => {
    await assertAdministrator(request)
    const restaurantId = slug(request.data?.restaurantId)
    const snapshot = await db.collection(`serveRestaurants/${restaurantId}/orders`).orderBy('createdAt', 'desc').limit(100).get()
    return { orders: snapshot.docs.map(serialize).map(order => ({ ...order, publicToken: undefined })) }
  })

  const updateServeOrderStatus = onCall(async request => {
    await assertAdministrator(request)
    const restaurantId = slug(request.data?.restaurantId)
    const orderId = slug(request.data?.orderId)
    const nextStatus = text(request.data?.status, 20).toUpperCase()
    if (!ORDER_STATUSES.includes(nextStatus)) throw new HttpsError('invalid-argument', 'Estado inválido.')
    const orderRef = db.doc(`serveRestaurants/${restaurantId}/orders/${orderId}`)
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(orderRef)
      if (!snapshot.exists) throw new HttpsError('not-found', 'Pedido no encontrado.')
      const current = snapshot.data().status
      if (!STATUS_TRANSITIONS[current]?.includes(nextStatus)) throw new HttpsError('failed-precondition', `No se puede cambiar de ${current} a ${nextStatus}.`)
      transaction.update(orderRef, {
        status: nextStatus, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid,
        timeline: FieldValue.arrayUnion({ status: nextStatus, at: new Date().toISOString(), actor: request.auth.uid })
      })
    })
    return { status: nextStatus }
  })

  const getMyServeWorkspace = onCall(async request => {
    const access = await assertServeManager(request, true)
    if (!access.restaurantId) return { restaurant: null, products: [], needsSetup: true }
    const restaurant = await db.doc(`serveRestaurants/${access.restaurantId}`).get()
    if (!restaurant.exists) throw new HttpsError('failed-precondition', 'El establecimiento asignado no existe.')
    const products = await db.collection(`serveRestaurants/${access.restaurantId}/products`).get()
    return { restaurant: serialize(restaurant), products: products.docs.map(serialize) }
  })

  const saveMyServeRestaurant = onCall(async request => {
    const access = await assertServeManager(request, true)
    const restaurantId = access.restaurantId || slug(request.data?.restaurant?.id)
    if (!restaurantId) throw new HttpsError('invalid-argument', 'Define un ID para crear el restaurante.')
    const restaurant = sanitizeRestaurant({ ...request.data?.restaurant, id: restaurantId })
    const restaurantRef = db.doc(`serveRestaurants/${restaurantId}`)
    if (!access.restaurantId && (await restaurantRef.get()).exists) {
      throw new HttpsError('already-exists', 'Ese ID ya pertenece a otro restaurante. Elige uno diferente.')
    }
    const batch = db.batch()
    batch.set(restaurantRef, {
      ...restaurant, updatedAt: FieldValue.serverTimestamp(), updatedBy: access.uid
    }, { merge: true })
    if (!access.restaurantId) batch.set(access.assignmentRef, { serveRestaurantId: restaurantId }, { merge: true })
    await batch.commit()
    return { restaurantId }
  })

  const saveMyServeProduct = onCall(async request => {
    const access = await assertServeManager(request)
    const product = sanitizeProduct({ ...request.data?.product, restaurantId: access.restaurantId })
    await db.doc(`serveRestaurants/${access.restaurantId}/products/${product.id}`).set({
      ...product, updatedAt: FieldValue.serverTimestamp(), updatedBy: access.uid
    }, { merge: true })
    return { productId: product.id }
  })

  const archiveMyServeProduct = onCall(async request => {
    const access = await assertServeManager(request)
    const productId = slug(request.data?.productId)
    if (!productId) throw new HttpsError('invalid-argument', 'El producto es obligatorio.')
    await db.doc(`serveRestaurants/${access.restaurantId}/products/${productId}`).set({
      archived: true, available: false, updatedAt: FieldValue.serverTimestamp(), updatedBy: access.uid
    }, { merge: true })
    return { archived: true }
  })

  const listMyServeOrders = onCall(async request => {
    const access = await assertServeManager(request, true)
    if (!access.restaurantId) return { orders: [] }
    const snapshot = await db.collection(`serveRestaurants/${access.restaurantId}/orders`).orderBy('createdAt', 'desc').limit(100).get()
    return { orders: snapshot.docs.map(serialize).map(order => ({ ...order, publicToken: undefined })) }
  })

  const updateMyServeOrderStatus = onCall(async request => {
    const access = await assertServeManager(request)
    const orderId = slug(request.data?.orderId)
    const nextStatus = text(request.data?.status, 20).toUpperCase()
    if (!ORDER_STATUSES.includes(nextStatus)) throw new HttpsError('invalid-argument', 'Estado inválido.')
    const orderRef = db.doc(`serveRestaurants/${access.restaurantId}/orders/${orderId}`)
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(orderRef)
      if (!snapshot.exists) throw new HttpsError('not-found', 'Pedido no encontrado.')
      const current = snapshot.data().status
      if (!STATUS_TRANSITIONS[current]?.includes(nextStatus)) throw new HttpsError('failed-precondition', `No se puede cambiar de ${current} a ${nextStatus}.`)
      transaction.update(orderRef, {
        status: nextStatus, updatedAt: FieldValue.serverTimestamp(), updatedBy: access.uid,
        timeline: FieldValue.arrayUnion({ status: nextStatus, at: new Date().toISOString(), actor: access.uid })
      })
    })
    return { status: nextStatus }
  })

  return {
    getServeRestaurantCatalog, createServeOrder, getServeOrderStatus,
    listServeRestaurants, getServeAdministrationCatalog, saveServeRestaurant,
    saveServeProduct, archiveServeProduct, listServeOrders, updateServeOrderStatus,
    getMyServeWorkspace, saveMyServeRestaurant, saveMyServeProduct,
    archiveMyServeProduct, listMyServeOrders, updateMyServeOrderStatus
  }
}
