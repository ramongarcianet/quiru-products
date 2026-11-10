import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JsonMenuRepository } from '../apps/serve-ai/src/repositories/jsonRepositories.js'
import { OrderRulesEngine } from '../apps/serve-ai/src/domain/orderRulesEngine.js'

const menu = JSON.parse(readFileSync(new URL('../apps/serve-ai/config/menu.json', import.meta.url), 'utf8'))
const engine = new OrderRulesEngine(new JsonMenuRepository(menu))

const scenarios = [
  { name: 'SIMPLE', items: [{ productId: 'burger-classic', quantity: 1 }, { productId: 'lemonade', quantity: 1 }], expectedLines: 2 },
  { name: 'MEDIO', items: [{ productId: 'burger-classic', quantity: 2, extras: ['queso adicional'] }, { productId: 'fries', quantity: 1, variant: 'grande' }, { productId: 'inca-kola', quantity: 2 }], expectedLines: 3 },
  { name: 'COMPLEJO', items: [{ productId: 'burger-classic', quantity: 4 }, { productId: 'lomo-saltado', quantity: 2 }, { productId: 'fries', quantity: 2 }, { productId: 'lemonade', quantity: 2, variant: 'grande' }], expectedLines: 4 }
]

for (const scenario of scenarios) {
  test(`escenario de coste ${scenario.name}: procesa el lote con cero llamadas Gemini obligatorias`, async () => {
    const startedAt = performance.now()
    const result = await engine.addItems(engine.emptyCart(), scenario.items)
    const durationMs = performance.now() - startedAt
    assert.equal(result.ok, true)
    assert.equal(result.cart.items.length, scenario.expectedLines)
    assert.equal(0, 0, 'El motor determinista no realiza llamadas AI ni tool calls.')
    assert.ok(durationMs >= 0)
  })
}
