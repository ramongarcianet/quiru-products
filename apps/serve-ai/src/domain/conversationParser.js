import { findMentionedProducts } from './orderRulesEngine.js'
import { normalizeText } from './text.js'

function quantityFrom(text, productName) {
  const normalized = normalizeText(text)
  const name = normalizeText(productName)
  const index = normalized.indexOf(name)
  const prefix = normalized.slice(Math.max(0, index - 18), index)
  if (/\b(dos|2)\s*$/.test(prefix)) return 2
  if (/\b(tres|3)\s*$/.test(prefix)) return 3
  if (/\b(cuatro|4)\s*$/.test(prefix)) return 4
  return 1
}

export function parseCatalogIntent(text, products, cart = { items: [] }) {
  const mentioned = findMentionedProducts(text, products)
  if (!mentioned.length) return null
  const normalized = normalizeText(text)
  if (/\b(cambia|reemplaza)\b/.test(normalized) && mentioned.length >= 2) {
    const target = cart.items.find(item => item.productId === mentioned[0].id)
    return target ? {
      intent: 'REPLACE_ITEM',
      items: [
        { targetLineId: target.id, productId: target.productId, productQuery: target.name, quantity: 1 },
        { productId: mentioned[1].id, productQuery: mentioned[1].name, quantity: target.quantity || 1 }
      ]
    } : null
  }
  if (/\b(quita|elimina|saca)\b/.test(normalized)) {
    const line = cart.items.find(item => mentioned.some(product => product.id === item.productId))
    return line ? { intent: 'REMOVE_ITEM', items: [{ targetLineId: line.id, productQuery: line.name, quantity: 1 }] } : null
  }
  const items = mentioned.map(product => {
    const request = { productId: product.id, productQuery: product.name, quantity: quantityFrom(text, product.name), extras: [], removeIngredients: [] }
    if (/\b(sin cebolla)\b/.test(normalized)) request.removeIngredients.push('cebolla')
    if (/\b(sin azucar)\b/.test(normalized)) request.removeIngredients.push('azúcar')
    if (/\b(queso extra|queso adicional|mas queso)\b/.test(normalized) && product.id === 'burger-classic') request.extras.push('queso adicional')
    if (/\bgrande(s)?\b/.test(normalized) && (product.modifierGroups || []).length) request.variant = 'grande'
    return request
  })
  return { intent: 'ADD_ITEMS', items }
}
