export function assertMinorUnits(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('El importe debe expresarse como un entero en la unidad monetaria mínima.')
  }
  return value
}

export function formatMoney(value, currency = 'PEN', locale = 'es-PE') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(assertMinorUnits(value) / 100)
}

export function lineUnitPrice(product, modifiers = []) {
  return assertMinorUnits(product.price) + modifiers.reduce(
    (total, modifier) => total + assertMinorUnits(modifier.priceDelta || 0),
    0
  )
}

export function priceCart(items = []) {
  const subtotal = items.reduce((total, item) => {
    const quantity = Number(item.quantity)
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Cantidad inválida en el pedido.')
    return total + assertMinorUnits(item.unitPrice) * quantity
  }, 0)
  return { subtotal, total: subtotal }
}
