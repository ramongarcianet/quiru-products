export class RestaurantRepository {
  async getRestaurant() { throw new Error('RestaurantRepository.getRestaurant no está implementado.') }
}

export class MenuRepository {
  async getCategories() { throw new Error('MenuRepository.getCategories no está implementado.') }
  async getAllProducts() { throw new Error('MenuRepository.getAllProducts no está implementado.') }
  async getProduct() { throw new Error('MenuRepository.getProduct no está implementado.') }
  async searchProducts() { throw new Error('MenuRepository.searchProducts no está implementado.') }
  async getCategoryProducts() { throw new Error('MenuRepository.getCategoryProducts no está implementado.') }
  async getProductModifiers() { throw new Error('MenuRepository.getProductModifiers no está implementado.') }
  async getUpsellRules() { throw new Error('MenuRepository.getUpsellRules no está implementado.') }
}

export class ConversationConfigRepository {
  async getConfig() { throw new Error('ConversationConfigRepository.getConfig no está implementado.') }
}

export class OrderRepository {
  async createOrder() { throw new Error('OrderRepository.createOrder no está implementado.') }
  async getOrderStatus() { throw new Error('OrderRepository.getOrderStatus no está implementado.') }
}
