import { httpsCallable } from 'firebase/functions'
import { RestaurantRepository } from './contracts.js'
import { matchesAlias, normalizeText } from '../domain/text.js'

const copy = value => JSON.parse(JSON.stringify(value))

export class FirebaseServeRepository extends RestaurantRepository {
  constructor(functions, restaurantId) {
    super()
    this.functions = functions
    this.restaurantId = restaurantId
    this.catalog = null
  }

  async loadCatalog(force = false) {
    if (this.catalog && !force) return this.catalog
    const callable = httpsCallable(this.functions, 'getServeRestaurantCatalog')
    const response = await callable({ restaurantId: this.restaurantId })
    this.catalog = response.data
    return this.catalog
  }

  async getRestaurant() { return copy((await this.loadCatalog()).restaurant) }
  async getConfig() { return copy((await this.loadCatalog()).restaurant.conversation || {}) }
  async getCategories() { return copy([...(await this.loadCatalog()).restaurant.categories || []].sort((a, b) => a.order - b.order)) }
  async getAllProducts() { return copy((await this.loadCatalog()).products || []) }
  async getProduct(id) { return copy((await this.loadCatalog()).products.find(product => product.id === id) || null) }
  async getCategoryProducts(categoryId) { return copy((await this.loadCatalog()).products.filter(product => product.categoryId === categoryId)) }
  async getProductModifiers(productId) { return copy((await this.loadCatalog()).products.find(product => product.id === productId)?.modifierGroups || []) }
  async getUpsellRules() { return copy((await this.loadCatalog()).restaurant.upsellRules || []) }

  async searchProducts(query, { includeUnavailable = true, limit = 8 } = {}) {
    const wanted = normalizeText(query)
    if (!wanted) return []
    const products = (await this.loadCatalog()).products || []
    return copy(products.filter(product => includeUnavailable || product.available).map(product => {
      const names = [product.name, ...(product.aliases || [])]
      const exact = names.some(name => normalizeText(name) === wanted)
      const included = names.some(name => matchesAlias(wanted, name))
      const tokens = wanted.split(' ').filter(token => token.length > 2)
      const tokenScore = tokens.filter(token => names.some(name => normalizeText(name).includes(token))).length
      return { product, score: exact ? 100 : included ? 50 + tokenScore : tokenScore }
    }).filter(result => result.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(result => result.product))
  }

  async createOrder(cart, { table = '', source = 'manual' } = {}) {
    const callable = httpsCallable(this.functions, 'createServeOrder')
    const clientOrderId = globalThis.crypto?.randomUUID?.() || `order-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const response = await callable({
      restaurantId: this.restaurantId, clientOrderId, table, source,
      items: cart.items.map(item => ({
        productId: item.productId, quantity: item.quantity,
        modifierIds: item.modifiers.map(modifier => modifier.id),
        removeIngredientIds: item.removeIngredients.map(ingredient => ingredient.id)
      }))
    })
    return response.data
  }

  async getOrderStatus(orderId, publicToken) {
    const callable = httpsCallable(this.functions, 'getServeOrderStatus')
    return (await callable({ restaurantId: this.restaurantId, orderId, publicToken })).data
  }
}

