const excel = async () => {
  const module = await import('exceljs')
  return module.default || module
}

const yesNo = value => value === true ? 'SI' : 'NO'
const list = value => Array.isArray(value) ? value.join(', ') : ''
const bool = value => ['si', 'sí', 'true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase())
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const id = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60)
const text = value => String(value ?? '').trim()
const split = value => text(value).split(',').map(item => item.trim()).filter(Boolean)

function addSheet(workbook, name, headers, rows, widths = {}) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = headers.map(header => ({ header, key: header, width: widths[header] || 20 }))
  rows.forEach(row => sheet.addRow(row))
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF087F8C' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  sheet.getRow(1).height = 26
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && rowNumber % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F7F8' } }
    row.alignment = { vertical: 'top', wrapText: true }
  })
  return sheet
}

const sampleRestaurant = {
  id: 'mi-restaurante', name: 'Mi Restaurante', description: 'Cocina peruana preparada al momento.',
  currency: 'PEN', orderingMode: 'TABLE', address: 'Av. Principal 123', phone: '999999999',
  whatsapp: '51999999999', businessHours: 'Lunes a domingo de 12:00 a 22:00', active: true
}
const sampleCategories = [
  { id: 'entradas', name: 'Entradas', order: 1 },
  { id: 'platos-principales', name: 'Platos principales', order: 2 },
  { id: 'bebidas', name: 'Bebidas', order: 3 }
]
const sampleProducts = [
  { id: 'tequenos', categoryId: 'entradas', name: 'Tequeños', description: 'Seis unidades con salsa de la casa.', price: 1690, available: true, productType: 'product', aliases: ['palitos de queso'], allergens: ['gluten', 'lácteos'], ingredients: [{ id: 'salsa', name: 'Salsa de la casa', removable: true }], modifierGroups: [] },
  { id: 'hamburguesa-clasica', categoryId: 'platos-principales', name: 'Hamburguesa clásica', description: 'Carne, queso, lechuga y tomate.', price: 2290, available: true, productType: 'product', aliases: ['hamburguesa', 'burger'], allergens: ['gluten', 'lácteos'], ingredients: [{ id: 'cebolla', name: 'Cebolla', removable: true }], modifierGroups: [{ id: 'extras', name: 'Extras', type: 'multiple', required: false, maxSelections: 3, options: [{ id: 'queso-extra', name: 'Queso adicional', priceDelta: 350, available: true, default: false, aliases: ['más queso'] }] }] },
  { id: 'papas-fritas', categoryId: 'platos-principales', name: 'Papas fritas', description: 'Papas crocantes.', price: 1090, available: true, productType: 'product', aliases: ['papas'], allergens: [], ingredients: [], modifierGroups: [] },
  { id: 'combo-clasico', categoryId: 'platos-principales', name: 'Combo clásico', description: 'Hamburguesa con papas.', price: 2990, available: true, productType: 'combo', aliases: ['combo'], allergens: [], ingredients: [], modifierGroups: [], comboItems: [{ productId: 'hamburguesa-clasica', quantity: 1 }, { productId: 'papas-fritas', quantity: 1 }] }
]

export async function downloadMenuTemplate(current = {}) {
  const ExcelJS = await excel()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'QUIRU Serve AI'
  workbook.created = new Date()
  const restaurant = current.restaurant?.id ? current.restaurant : sampleRestaurant
  const categories = current.restaurant?.categories?.length ? current.restaurant.categories : sampleCategories
  const products = current.products?.length ? current.products.filter(product => !product.archived) : sampleProducts
  const upsellRules = current.restaurant?.upsellRules?.length ? current.restaurant.upsellRules : [{ triggerProductId: 'hamburguesa-clasica', suggestProductId: 'papas-fritas' }]

  const instructions = workbook.addWorksheet('LEEME')
  instructions.columns = [{ width: 28 }, { width: 95 }]
  ;[
    ['QUIRU Serve AI · Plantilla de carga masiva', 'No cambies los nombres de las hojas ni de las columnas.'],
    ['Precio', 'Registra precios en soles con decimales, por ejemplo 22.90. El sistema los convertirá a céntimos.'],
    ['Identificadores', 'Usa minúsculas, números y guiones; deben ser únicos. Ejemplo: hamburguesa-clasica.'],
    ['Valores booleanos', 'Usa SI o NO en las columnas de disponibilidad, obligatoriedad y removible.'],
    ['Relaciones', 'categoria_id, producto_id y grupo_id deben coincidir con IDs existentes en las otras hojas.'],
    ['Importación', 'En Carta y operación selecciona el archivo, revisa el resumen y confirma la carga. Los IDs existentes serán actualizados.']
  ].forEach(row => instructions.addRow(row))
  instructions.getRow(1).font = { bold: true, size: 16, color: { argb: 'FF087F8C' } }
  instructions.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true }; row.height = 34 })

  addSheet(workbook, 'Restaurante', ['id', 'nombre', 'descripcion', 'moneda', 'modalidad', 'direccion', 'telefono', 'whatsapp', 'horario', 'activo'], [{
    id: restaurant.id, nombre: restaurant.name, descripcion: restaurant.description, moneda: restaurant.currency || 'PEN', modalidad: restaurant.orderingMode || 'TABLE', direccion: restaurant.contact?.address || restaurant.address || '', telefono: restaurant.contact?.phone || restaurant.phone || '', whatsapp: restaurant.contact?.whatsapp || restaurant.whatsapp || '', horario: restaurant.businessHours || '', activo: yesNo(restaurant.active !== false)
  }], { descripcion: 42, direccion: 35, horario: 35 })
  addSheet(workbook, 'Categorias', ['id', 'nombre', 'orden'], categories.map(category => ({ id: category.id, nombre: category.name, orden: category.order })))
  addSheet(workbook, 'Productos', ['id', 'categoria_id', 'nombre', 'descripcion', 'precio', 'disponible', 'tipo', 'aliases', 'alergenos'], products.map(product => ({ id: product.id, categoria_id: product.categoryId, nombre: product.name, descripcion: product.description, precio: Number(product.price || 0) / 100, disponible: yesNo(product.available !== false), tipo: product.productType === 'combo' ? 'combo' : 'producto', aliases: list(product.aliases), alergenos: list(product.allergens) })), { nombre: 28, descripcion: 48, aliases: 35, alergenos: 28 })
  addSheet(workbook, 'Ingredientes', ['producto_id', 'id', 'nombre', 'removible'], products.flatMap(product => (product.ingredients || []).map(ingredient => ({ producto_id: product.id, id: ingredient.id, nombre: ingredient.name, removible: yesNo(ingredient.removable) }))))
  addSheet(workbook, 'Modificadores', ['producto_id', 'grupo_id', 'grupo_nombre', 'tipo', 'obligatorio', 'max_selecciones', 'opcion_id', 'opcion_nombre', 'precio_adicional', 'disponible', 'predeterminado', 'aliases'], products.flatMap(product => (product.modifierGroups || []).flatMap(group => (group.options || []).map(option => ({ producto_id: product.id, grupo_id: group.id, grupo_nombre: group.name, tipo: group.type, obligatorio: yesNo(group.required), max_selecciones: group.maxSelections || 1, opcion_id: option.id, opcion_nombre: option.name, precio_adicional: Number(option.priceDelta || 0) / 100, disponible: yesNo(option.available !== false), predeterminado: yesNo(option.default), aliases: list(option.aliases) })))), { grupo_nombre: 28, opcion_nombre: 28, aliases: 30 })
  addSheet(workbook, 'Combos', ['combo_id', 'producto_id', 'cantidad'], products.flatMap(product => (product.comboItems || []).map(item => ({ combo_id: product.id, producto_id: item.productId, cantidad: item.quantity || 1 }))))
  addSheet(workbook, 'Sugerencias', ['producto_disparador_id', 'producto_sugerido_id'], upsellRules.map(rule => ({ producto_disparador_id: rule.triggerProductId, producto_sugerido_id: rule.suggestProductId })))

  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `plantilla-carta-${id(restaurant.id || 'restaurante') || 'restaurante'}.xlsx`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function rowsFrom(sheet) {
  if (!sheet) return []
  const headers = sheet.getRow(1).values.slice(1).map(value => text(value).toLowerCase())
  const rows = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const item = {}
    headers.forEach((header, index) => { item[header] = row.getCell(index + 1).value?.text ?? row.getCell(index + 1).value ?? '' })
    if (Object.values(item).some(value => text(value))) rows.push(item)
  })
  return rows
}

export async function parseMenuWorkbook(buffer) {
  const ExcelJS = await excel()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const restaurantRow = rowsFrom(workbook.getWorksheet('Restaurante'))[0] || {}
  const categoryRows = rowsFrom(workbook.getWorksheet('Categorias'))
  const productRows = rowsFrom(workbook.getWorksheet('Productos'))
  if (!productRows.length) throw new Error('La hoja Productos no contiene filas para importar.')

  const categories = categoryRows.map((row, index) => ({ id: id(row.id), name: text(row.nombre), order: number(row.orden, index + 1) })).filter(item => item.id && item.name)
  const productMap = new Map(productRows.map(row => {
    const product = { id: id(row.id), categoryId: id(row.categoria_id), name: text(row.nombre), description: text(row.descripcion), price: Math.round(number(row.precio) * 100), available: bool(row.disponible), productType: text(row.tipo).toLowerCase() === 'combo' ? 'combo' : 'product', aliases: split(row.aliases), allergens: split(row.alergenos), ingredients: [], modifierGroups: [], comboItems: [] }
    return [product.id, product]
  }).filter(([productId, product]) => productId && product.name))

  rowsFrom(workbook.getWorksheet('Ingredientes')).forEach(row => {
    productMap.get(id(row.producto_id))?.ingredients.push({ id: id(row.id), name: text(row.nombre), removable: bool(row.removible) })
  })
  const groups = new Map()
  rowsFrom(workbook.getWorksheet('Modificadores')).forEach(row => {
    const productId = id(row.producto_id)
    const groupId = id(row.grupo_id)
    const product = productMap.get(productId)
    if (!product || !groupId) return
    const key = `${productId}:${groupId}`
    if (!groups.has(key)) {
      const group = { id: groupId, name: text(row.grupo_nombre), type: text(row.tipo).toLowerCase() === 'multiple' ? 'multiple' : 'single', required: bool(row.obligatorio), maxSelections: number(row.max_selecciones, 1), options: [] }
      groups.set(key, group)
      product.modifierGroups.push(group)
    }
    groups.get(key).options.push({ id: id(row.opcion_id), name: text(row.opcion_nombre), priceDelta: Math.round(number(row.precio_adicional) * 100), available: bool(row.disponible), default: bool(row.predeterminado), aliases: split(row.aliases) })
  })
  rowsFrom(workbook.getWorksheet('Combos')).forEach(row => {
    productMap.get(id(row.combo_id))?.comboItems.push({ productId: id(row.producto_id), quantity: Math.max(1, Math.round(number(row.cantidad, 1))) })
  })
  const upsellRules = rowsFrom(workbook.getWorksheet('Sugerencias')).map(row => ({ triggerProductId: id(row.producto_disparador_id), suggestProductId: id(row.producto_sugerido_id) })).filter(rule => rule.triggerProductId && rule.suggestProductId)
  const products = [...productMap.values()]
  const categoryIds = new Set(categories.map(category => category.id))
  const productIds = new Set(products.map(product => product.id))
  const errors = []
  products.forEach(product => {
    if (!categoryIds.has(product.categoryId)) errors.push(`${product.name}: la categoría ${product.categoryId || '(vacía)'} no existe.`)
    if (product.productType === 'combo' && !product.comboItems.length) errors.push(`${product.name}: el combo no tiene productos relacionados.`)
    product.comboItems.forEach(item => { if (!productIds.has(item.productId)) errors.push(`${product.name}: el producto ${item.productId} del combo no existe.`) })
  })
  if (errors.length) throw new Error(errors.slice(0, 8).join(' '))
  return {
    restaurant: { id: id(restaurantRow.id), name: text(restaurantRow.nombre), description: text(restaurantRow.descripcion), currency: text(restaurantRow.moneda).toUpperCase() || 'PEN', orderingMode: text(restaurantRow.modalidad).toUpperCase() === 'ONLINE' ? 'ONLINE' : 'TABLE', contact: { address: text(restaurantRow.direccion), phone: text(restaurantRow.telefono), whatsapp: text(restaurantRow.whatsapp) }, businessHours: text(restaurantRow.horario), active: bool(restaurantRow.activo), categories, upsellRules },
    products,
    summary: { categories: categories.length, products: products.length, ingredients: products.reduce((sum, product) => sum + product.ingredients.length, 0), modifiers: products.reduce((sum, product) => sum + product.modifierGroups.reduce((total, group) => total + group.options.length, 0), 0), combos: products.filter(product => product.productType === 'combo').length, suggestions: upsellRules.length }
  }
}
