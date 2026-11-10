import { ConversationConfigRepository, MenuRepository, RestaurantRepository } from './contracts.js'
import { matchesAlias, normalizeText } from '../domain/text.js'

const copy = value => JSON.parse(JSON.stringify(value))

export class JsonRestaurantRepository extends RestaurantRepository {
  constructor(config) { super(); this.config = config }
  async getRestaurant() { return copy(this.config) }
}

export class JsonConversationConfigRepository extends ConversationConfigRepository {
  constructor(config) { super(); this.config = config }
  async getConfig() { return copy(this.config) }
}

export class JsonMenuRepository extends MenuRepository {
  constructor(config) {
    super()
    this.config = config
    this.products = new Map(config.products.map(product => [product.id, product]))
  }

  async getCategories() { return copy([...this.config.categories].sort((a, b) => a.order - b.order)) }
  async getAllProducts() { return copy(this.config.products) }
  async getProduct(id) { return this.products.has(id) ? copy(this.products.get(id)) : null }
  async getCategoryProducts(categoryId) {
    return copy(this.config.products.filter(product => product.categoryId === categoryId))
  }
  async getProductModifiers(productId) {
    return copy(this.products.get(productId)?.modifierGroups || [])
  }
  async getUpsellRules() { return copy(this.config.upsellRules || []) }

  async searchProducts(query, { includeUnavailable = true, limit = 8 } = {}) {
    const wanted = normalizeText(query)
    if (!wanted) return []
    const scored = this.config.products
      .filter(product => includeUnavailable || product.available)
      .map(product => {
        const names = [product.name, ...(product.aliases || [])]
        const exact = names.some(name => normalizeText(name) === wanted)
        const included = names.some(name => matchesAlias(wanted, name))
        const tokens = wanted.split(' ').filter(token => token.length > 2)
        const tokenScore = tokens.filter(token => names.some(name => normalizeText(name).includes(token))).length
        return { product, score: exact ? 100 : included ? 50 + tokenScore : tokenScore }
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
      .slice(0, limit)
      .map(result => result.product)
    return copy(scored)
  }
}

export class JsonServeRepository {
  constructor(restaurant, menu, conversation) {
    this.restaurantRepository = new JsonRestaurantRepository(restaurant)
    this.menuRepository = new JsonMenuRepository(menu)
    this.conversationRepository = new JsonConversationConfigRepository(conversation)
  }
  getRestaurant() { return this.restaurantRepository.getRestaurant() }
  getConfig() { return this.conversationRepository.getConfig() }
  getCategories() { return this.menuRepository.getCategories() }
  getAllProducts() { return this.menuRepository.getAllProducts() }
  getProduct(id) { return this.menuRepository.getProduct(id) }
  searchProducts(query, options) { return this.menuRepository.searchProducts(query, options) }
  getCategoryProducts(id) { return this.menuRepository.getCategoryProducts(id) }
  getProductModifiers(id) { return this.menuRepository.getProductModifiers(id) }
  getUpsellRules() { return this.menuRepository.getUpsellRules() }
}

export class RuntimeServeRepository {
  constructor(repository) { this.repository = repository }
  use(repository) { this.repository = repository }
  getRestaurant() { return this.repository.getRestaurant() }
  getConfig() { return this.repository.getConfig() }
  getCategories() { return this.repository.getCategories() }
  getAllProducts() { return this.repository.getAllProducts() }
  getProduct(id) { return this.repository.getProduct(id) }
  searchProducts(query, options) { return this.repository.searchProducts(query, options) }
  getCategoryProducts(id) { return this.repository.getCategoryProducts(id) }
  getProductModifiers(id) { return this.repository.getProductModifiers(id) }
  getUpsellRules() { return this.repository.getUpsellRules() }
}
