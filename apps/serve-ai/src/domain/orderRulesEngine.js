import { lineUnitPrice, priceCart } from './money.js'
import { matchesAlias, normalizeText } from './text.js'
import { validateOrderIntent } from './orderIntent.js'

const MAX_QUANTITY = 20
const clone = value => JSON.parse(JSON.stringify(value))
const uniqueId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function optionNames(option) { return [option.name, ...(option.aliases || [])] }

function matchOption(groups, query) {
  const candidates = []
  for (const group of groups || []) {
    for (const option of group.options || []) {
      if (option.available !== false && optionNames(option).some(name => matchesAlias(query, name))) {
        candidates.push({ ...option, groupId: group.id, groupName: group.name, groupType: group.type })
      }
    }
  }
  return candidates.length === 1 ? candidates[0] : null
}

function defaultModifiers(product) {
  return (product.modifierGroups || []).flatMap(group => {
    const selected = (group.options || []).find(option => option.default && option.available !== false)
    return selected ? [{ ...selected, groupId: group.id, groupName: group.name, groupType: group.type }] : []
  })
}

function lineSignature(line) {
  const modifiers = [...line.modifiers].map(item => `${item.groupId}:${item.id}`).sort().join('|')
  const removals = [...line.removeIngredients].map(item => item.id).sort().join('|')
  return `${line.productId}::${modifiers}::${removals}`
}

export class OrderRulesEngine {
  constructor(menuRepository) { this.menuRepository = menuRepository }

  emptyCart() { return { items: [], subtotal: 0, total: 0, updatedAt: new Date().toISOString() } }

  pricedCart(items) {
    const totals = priceCart(items)
    return { items: clone(items), ...totals, updatedAt: new Date().toISOString() }
  }

  async resolveProduct(request) {
    if (request.productId) {
      const product = await this.menuRepository.getProduct(request.productId)
      if (product) return { product }
    }
    const matches = await this.menuRepository.searchProducts(request.productQuery || '', { limit: 5 })
    if (matches.length === 1) return { product: matches[0] }
    if (!matches.length) return { error: 'No encontré ese producto en el menú.' }
    return { error: `Encontré varias opciones: ${matches.map(item => item.name).join(', ')}. ¿Cuál deseas?` }
  }

  async buildLine(request) {
    const quantity = Number(request.quantity || 1)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return { error: `La cantidad debe estar entre 1 y ${MAX_QUANTITY}.` }
    }
    const resolved = await this.resolveProduct(request)
    if (!resolved.product) return resolved
    const product = resolved.product
    if (!product.available) return { error: `${product.name} no está disponible por el momento.` }

    const modifiers = defaultModifiers(product)
    const groups = product.modifierGroups || []
    const requestedOptions = [request.variant, ...(request.extras || [])].filter(Boolean)
    for (const query of requestedOptions) {
      const option = matchOption(groups, query)
      if (!option) return { error: `${query} no es una opción válida para ${product.name}.` }
      const group = groups.find(item => item.id === option.groupId)
      const withoutSameSingle = group?.type === 'single'
        ? modifiers.filter(item => item.groupId !== option.groupId)
        : modifiers
      modifiers.splice(0, modifiers.length, ...withoutSameSingle)
      if (!modifiers.some(item => item.groupId === option.groupId && item.id === option.id)) modifiers.push(option)
      const selectedInGroup = modifiers.filter(item => item.groupId === option.groupId).length
      if (group?.maxSelections && selectedInGroup > group.maxSelections) {
        return { error: `Solo puedes elegir ${group.maxSelections} opciones en ${group.name}.` }
      }
    }

    const removeIngredients = []
    for (const query of request.removeIngredients || []) {
      const matches = (product.ingredients || []).filter(ingredient => matchesAlias(query, ingredient.name))
      if (matches.length !== 1) return { error: `No pude identificar el ingrediente ${query} en ${product.name}.` }
      if (!matches[0].removable) return { error: `${matches[0].name} no se puede retirar de ${product.name}.` }
      if (!removeIngredients.some(item => item.id === matches[0].id)) removeIngredients.push(matches[0])
    }

    const missingGroup = groups.find(group => group.required && !modifiers.some(item => item.groupId === group.id))
    if (missingGroup) return { error: `Falta elegir ${missingGroup.name} para ${product.name}.`, missing: missingGroup.id }

    const line = {
      id: uniqueId('line'), productId: product.id, name: product.name, quantity,
      basePrice: product.price, modifiers, removeIngredients,
      unitPrice: lineUnitPrice(product, modifiers), allergens: product.allergens || []
    }
    return { line }
  }

  async addItems(cart, requests) {
    const lines = []
    for (const request of requests || []) {
      const result = await this.buildLine(request)
      if (!result.line) return { ok: false, cart, message: result.error, missing: result.missing || null }
      lines.push(result.line)
    }
    const nextItems = clone(cart.items || [])
    for (const line of lines) {
      const existing = nextItems.find(item => lineSignature(item) === lineSignature(line))
      if (existing && existing.quantity + line.quantity <= MAX_QUANTITY) existing.quantity += line.quantity
      else nextItems.push(line)
    }
    return { ok: true, cart: this.pricedCart(nextItems), lines }
  }

  resolveCartLineId(cart, request = {}, fallbackLineId = '') {
    if (request.targetLineId && cart.items.some(item => item.id === request.targetLineId)) return request.targetLineId
    const query = request.productQuery || ''
    if (query) {
      const matches = cart.items.filter(item => matchesAlias(query, item.name))
      if (matches.length === 1) return matches[0].id
    }
    return fallbackLineId
  }

  async updateItem(cart, request, fallbackLineId = '') {
    const lineId = this.resolveCartLineId(cart, request, fallbackLineId)
    const index = cart.items.findIndex(item => item.id === lineId)
    if (index < 0) return { ok: false, cart, message: 'Indica qué producto deseas modificar.' }
    const items = clone(cart.items)
    const line = items[index]
    if (request.quantity !== undefined) {
      const quantity = Number(request.quantity)
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
        return { ok: false, cart, message: `La cantidad debe estar entre 1 y ${MAX_QUANTITY}.` }
      }
      line.quantity = quantity
    }
    const product = await this.menuRepository.getProduct(line.productId)
    if (!product) return { ok: false, cart, message: 'El producto ya no existe en el menú.' }
    for (const query of request.removeIngredients || []) {
      const ingredient = (product.ingredients || []).find(item => matchesAlias(query, item.name))
      if (!ingredient || !ingredient.removable) return { ok: false, cart, message: `No puedo retirar ${query} de ${line.name}.` }
      if (!line.removeIngredients.some(item => item.id === ingredient.id)) line.removeIngredients.push(ingredient)
    }
    for (const query of [request.variant, ...(request.extras || [])].filter(Boolean)) {
      const option = matchOption(product.modifierGroups || [], query)
      if (!option) return { ok: false, cart, message: `${query} no es una opción válida para ${line.name}.` }
      if (option.groupType === 'single') line.modifiers = line.modifiers.filter(item => item.groupId !== option.groupId)
      if (!line.modifiers.some(item => item.groupId === option.groupId && item.id === option.id)) line.modifiers.push(option)
    }
    line.unitPrice = lineUnitPrice(product, line.modifiers)
    return { ok: true, cart: this.pricedCart(items), line }
  }

  removeItem(cart, lineId) {
    if (!lineId) return { ok: false, cart, message: 'Indica qué producto deseas quitar.' }
    const items = cart.items.filter(item => item.id !== lineId)
    if (items.length === cart.items.length) return { ok: false, cart, message: 'Ese producto no está en el pedido.' }
    return { ok: true, cart: this.pricedCart(items) }
  }

  validateFinal(cart) {
    if (!cart.items?.length) return { ok: false, errors: ['El pedido está vacío.'] }
    const errors = []
    for (const item of cart.items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) errors.push(`Cantidad inválida para ${item.name}.`)
      if (!Number.isInteger(item.unitPrice) || item.unitPrice < 0) errors.push(`Precio inválido para ${item.name}.`)
    }
    const totals = priceCart(cart.items)
    if (totals.total !== cart.total) errors.push('El total del carrito no coincide con sus productos.')
    return { ok: !errors.length, errors, totals }
  }

  createOrder(cart, restaurant, table = '') {
    const validation = this.validateFinal(cart)
    if (!validation.ok) throw new Error(validation.errors.join(' '))
    return {
      id: uniqueId('demo-order'), restaurantId: restaurant.id, mode: restaurant.orderingMode,
      ...(restaurant.orderingMode === 'TABLE' && table ? { table } : {}),
      items: clone(cart.items), subtotal: validation.totals.subtotal, total: validation.totals.total,
      status: 'CONFIRMED', createdAt: new Date().toISOString(), demoMode: restaurant.demoMode === true
    }
  }

  async applyIntent(cart, rawIntent, context = {}) {
    const parsed = validateOrderIntent(rawIntent)
    if (!parsed.ok) return { ok: false, cart, message: parsed.errors[0] }
    const intent = parsed.value
    if (intent.intent === 'ADD_ITEMS') return this.addItems(cart, intent.items)
    if (intent.intent === 'UPDATE_ITEM') return this.updateItem(cart, intent.items[0], context.lastLineId)
    if (intent.intent === 'REMOVE_ITEM') {
      const lineId = this.resolveCartLineId(cart, intent.items[0], context.lastLineId)
      return this.removeItem(cart, lineId)
    }
    if (intent.intent === 'REPLACE_ITEM') {
      const target = intent.items[0] || {}
      const replacement = intent.items[1]
      if (!replacement) return { ok: false, cart, message: 'Indica el producto de reemplazo.' }
      const lineId = this.resolveCartLineId(cart, target, context.lastLineId)
      const removed = this.removeItem(cart, lineId)
      if (!removed.ok) return removed
      const added = await this.addItems(removed.cart, [replacement])
      return added.ok ? { ...added, replacedLineId: lineId } : { ...added, cart }
    }
    if (intent.intent === 'CLEAR_CART' || intent.intent === 'CANCEL_ORDER') return { ok: true, cart: this.emptyCart() }
    if (['GET_TOTAL', 'LIST_PRODUCTS', 'CONFIRM_ORDER'].includes(intent.intent)) return { ok: true, cart, intent: intent.intent }
    return { ok: false, cart, message: 'No entendí qué deseas hacer con el pedido.' }
  }
}

export function findMentionedProducts(text, products) {
  const normalized = normalizeText(text)
  return products.filter(product => [product.name, ...(product.aliases || [])]
    .some(name => normalized.includes(normalizeText(name))))
}
