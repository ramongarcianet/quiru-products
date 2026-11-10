import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JsonMenuRepository } from '../apps/serve-ai/src/repositories/jsonRepositories.js'
import { OrderRulesEngine } from '../apps/serve-ai/src/domain/orderRulesEngine.js'
import { detectLocalIntent } from '../apps/serve-ai/src/domain/orderIntent.js'
import { parseCatalogIntent } from '../apps/serve-ai/src/domain/conversationParser.js'
import { lineUnitPrice, priceCart } from '../apps/serve-ai/src/domain/money.js'

const menu = JSON.parse(readFileSync(new URL('../apps/serve-ai/config/menu.json', import.meta.url), 'utf8'))
const repository = new JsonMenuRepository(menu)
const engine = new OrderRulesEngine(repository)

test('Pricing usa unidades monetarias enteras y suma modificadores determinísticamente', async () => {
  const burger = await repository.getProduct('burger-classic')
  const extra = burger.modifierGroups[0].options[0]
  assert.equal(lineUnitPrice(burger, [extra]), 2640)
  assert.deepEqual(priceCart([{ quantity: 2, unitPrice: 2640 }]), { subtotal: 5280, total: 5280 })
})

test('agrega varios productos y calcula el total sin intervención de Gemini', async () => {
  const result = await engine.addItems(engine.emptyCart(), [
    { productId: 'burger-classic', quantity: 2, extras: ['queso adicional'], removeIngredients: ['cebolla'] },
    { productId: 'lemonade', quantity: 1, variant: 'grande' }
  ])
  assert.equal(result.ok, true)
  assert.equal(result.cart.items.length, 2)
  assert.equal(result.cart.total, 6470)
})

test('rechaza productos inexistentes y no disponibles', async () => {
  const missing = await engine.addItems(engine.emptyCart(), [{ productQuery: 'sushi', quantity: 1 }])
  const unavailable = await engine.addItems(engine.emptyCart(), [{ productId: 'brownie', quantity: 1 }])
  assert.equal(missing.ok, false)
  assert.match(missing.message, /no encontré/i)
  assert.equal(unavailable.ok, false)
  assert.match(unavailable.message, /no está disponible/i)
})

test('valida cantidades, extras e ingredientes removibles', async () => {
  const quantity = await engine.addItems(engine.emptyCart(), [{ productId: 'burger-classic', quantity: 21 }])
  const invalidExtra = await engine.addItems(engine.emptyCart(), [{ productId: 'burger-classic', extras: ['palta'] }])
  const fixedIngredient = await engine.addItems(engine.emptyCart(), [{ productId: 'burger-classic', removeIngredients: ['carne'] }])
  assert.equal(quantity.ok, false)
  assert.equal(invalidExtra.ok, false)
  assert.equal(fixedIngredient.ok, false)
})

test('modifica y elimina líneas sin recalcular dinero mediante IA', async () => {
  const added = await engine.addItems(engine.emptyCart(), [{ productId: 'burger-classic', quantity: 1 }])
  const line = added.cart.items[0]
  const modified = await engine.updateItem(added.cart, {
    targetLineId: line.id, quantity: 2, extras: ['queso adicional'], removeIngredients: ['cebolla']
  })
  assert.equal(modified.ok, true)
  assert.equal(modified.cart.total, 5280)
  const removed = engine.removeItem(modified.cart, line.id)
  assert.equal(removed.ok, true)
  assert.equal(removed.cart.total, 0)
})

test('genera un pedido demo estructurado solo después de validar el carrito', async () => {
  const added = await engine.addItems(engine.emptyCart(), [{ productId: 'lomo-saltado', quantity: 1 }])
  const order = engine.createOrder(added.cart, {
    id: 'demo', orderingMode: 'TABLE', demoMode: true
  }, '12')
  assert.equal(order.status, 'CONFIRMED')
  assert.equal(order.table, '12')
  assert.equal(order.total, 3290)
  assert.equal(order.demoMode, true)
})

test('interpreta localmente las frases conversacionales principales', async () => {
  let cart = engine.emptyCart()
  let intent = parseCatalogIntent('Quiero una hamburguesa clásica.', menu.products, cart)
  let result = await engine.applyIntent(cart, intent)
  assert.equal(result.ok, true); cart = result.cart
  const burgerId = cart.items[0].id

  intent = detectLocalIntent('Sin cebolla.')
  result = await engine.applyIntent(cart, intent, { lastLineId: burgerId })
  assert.equal(result.ok, true); cart = result.cart

  intent = detectLocalIntent('Ponle queso.')
  result = await engine.applyIntent(cart, intent, { lastLineId: burgerId })
  assert.equal(result.ok, true); cart = result.cart

  intent = detectLocalIntent('Mejor dos.')
  result = await engine.applyIntent(cart, intent, { lastLineId: burgerId })
  assert.equal(result.ok, true); cart = result.cart
  assert.equal(cart.items[0].quantity, 2)

  intent = parseCatalogIntent('Una Inca Kola grande.', menu.products, cart)
  result = await engine.applyIntent(cart, intent); cart = result.cart
  assert.equal(cart.items.find(item => item.productId === 'inca-kola').unitPrice, 1400)

  intent = parseCatalogIntent('Cambia la Inca Kola por Coca-Cola.', menu.products, cart)
  result = await engine.applyIntent(cart, intent); cart = result.cart
  assert.equal(result.ok, true)
  assert.equal(cart.items.some(item => item.productId === 'inca-kola'), false)
  assert.equal(cart.items.some(item => item.productId === 'coca-cola'), true)

  assert.equal(detectLocalIntent('¿Cuánto llevo?').intent, 'GET_TOTAL')
  assert.equal(detectLocalIntent('Confirma.').intent, 'CONFIRM_ORDER')
  assert.equal(detectLocalIntent('Cancelar.').intent, 'CANCEL_ORDER')
})

test('consulta bebidas desde MenuRepository sin enviar el menú completo a un modelo', async () => {
  const drinks = await repository.getCategoryProducts('drinks')
  assert.deepEqual(drinks.filter(item => item.available).map(item => item.id), ['lemonade', 'inca-kola', 'coca-cola'])
})
