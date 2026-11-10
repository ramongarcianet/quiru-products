import { normalizeText } from './text.js'

export const ORDER_INTENTS = Object.freeze([
  'ADD_ITEMS', 'REMOVE_ITEM', 'UPDATE_ITEM', 'REPLACE_ITEM', 'CLEAR_CART',
  'GET_TOTAL', 'LIST_PRODUCTS', 'CONFIRM_ORDER', 'CANCEL_ORDER', 'UNKNOWN'
])

const cleanStrings = value => Array.isArray(value)
  ? value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 10)
  : []

export function validateOrderIntent(value) {
  if (!value || typeof value !== 'object' || !ORDER_INTENTS.includes(value.intent)) {
    return { ok: false, errors: ['La intención no tiene un tipo válido.'] }
  }
  const items = Array.isArray(value.items) ? value.items.slice(0, 12).map(item => ({
    productId: typeof item?.productId === 'string' ? item.productId.trim() : '',
    productQuery: typeof item?.productQuery === 'string' ? item.productQuery.trim() : '',
    quantity: Number.isInteger(Number(item?.quantity)) ? Number(item.quantity) : 1,
    variant: typeof item?.variant === 'string' ? item.variant.trim() : '',
    extras: cleanStrings(item?.extras),
    removeIngredients: cleanStrings(item?.removeIngredients),
    targetLineId: typeof item?.targetLineId === 'string' ? item.targetLineId.trim() : ''
  })) : []
  if (['ADD_ITEMS', 'REMOVE_ITEM', 'UPDATE_ITEM', 'REPLACE_ITEM'].includes(value.intent) && !items.length) {
    return { ok: false, errors: ['La intención necesita al menos un producto.'] }
  }
  if (items.some(item => item.quantity < 1 || item.quantity > 20)) {
    return { ok: false, errors: ['Las cantidades deben estar entre 1 y 20.'] }
  }
  return {
    ok: true,
    value: {
      intent: value.intent,
      items,
      categoryQuery: typeof value.categoryQuery === 'string' ? value.categoryQuery.trim() : '',
      reply: typeof value.reply === 'string' ? value.reply.trim().slice(0, 180) : ''
    }
  }
}

export function detectLocalIntent(text) {
  const value = normalizeText(text)
  if (/^(confirmo|confirmar|confirma|si confirmo|hacer pedido)$/.test(value)) return { intent: 'CONFIRM_ORDER', items: [] }
  if (/^(cancelar|cancela|cancelar pedido)$/.test(value)) return { intent: 'CANCEL_ORDER', items: [] }
  if (/(vacia|vaciar|borra|limpia).*(carrito|pedido|todo)/.test(value)) return { intent: 'CLEAR_CART', items: [] }
  if (/(cuanto llevo|cuanto es|total|cuanto cuesta)/.test(value)) return { intent: 'GET_TOTAL', items: [] }
  if (/^(sin|quita|quitale)\s+/.test(value)) {
    return { intent: 'UPDATE_ITEM', items: [{ quantity: 1, removeIngredients: [value.replace(/^(sin|quita|quitale)\s+/, '')] }] }
  }
  if (/^(ponle|agrega|anade)\s+/.test(value)) {
    return { intent: 'UPDATE_ITEM', items: [{ quantity: 1, extras: [value.replace(/^(ponle|agrega|anade)\s+/, '')] }] }
  }
  const quantity = /\b(dos|2)\b/.test(value) ? 2 : /\b(tres|3)\b/.test(value) ? 3 : 1
  if (/^(mejor|quiero)\s+(dos|tres|2|3)$/.test(value)) {
    return { intent: 'UPDATE_ITEM', items: [{ quantity }] }
  }
  return null
}
