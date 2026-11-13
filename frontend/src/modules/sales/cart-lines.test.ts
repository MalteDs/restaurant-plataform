import { describe, expect, it } from 'vitest'
import type { ProductRow, SaleAddonRow } from '../../infrastructure/database/schema'
import { addToCart, type CartLine } from './cart-lines'

const product: ProductRow = {
  id: 'p1',
  name: 'SENCILLA',
  categoryName: 'HAMBURGUESAS',
  kind: 'PRODUCT',
  pricePesos: 16500,
  costPesos: null,
  sortOrder: 1,
  active: true,
  modifierGroupIds: [],
  components: []
}

const addon = (id: string, quantity = 1): SaleAddonRow => ({
  id,
  name: id,
  pricePesos: 5000,
  quantity
})

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    key: crypto.randomUUID(),
    product,
    quantity: 1,
    unitPricePesos: 16500,
    catalogUnitPricePesos: 16500,
    overrideReason: null,
    addons: [],
    ...overrides
  }
}

describe('addToCart', () => {
  it('suma cantidad cuando coinciden producto y adicionales', () => {
    const first = addToCart([], product, [addon('a1')], 16500)
    const result = addToCart(first, product, [addon('a1')], 16500)

    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(2)
  })

  it('fusiona aunque los adicionales lleguen en otro orden', () => {
    const first = addToCart([], product, [addon('a1'), addon('a2')], 16500)
    const result = addToCart(first, product, [addon('a2'), addon('a1')], 16500)

    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(2)
  })

  it('mantiene líneas separadas con adicionales distintos', () => {
    const first = addToCart([], product, [addon('a1')], 16500)
    const result = addToCart(first, product, [addon('a2')], 16500)

    expect(result).toHaveLength(2)
    expect(result.map((item) => item.quantity)).toEqual([1, 1])
  })

  it('no fusiona dos adicionales iguales con cantidades distintas', () => {
    const first = addToCart([], product, [addon('a1', 1)], 16500)
    const result = addToCart(first, product, [addon('a1', 2)], 16500)

    expect(result).toHaveLength(2)
  })

  it('no fusiona una línea con precio cambiado y usa el precio recibido', () => {
    const changed = line({ overrideReason: 'descuento', unitPricePesos: 15000 })
    const result = addToCart([changed], product, [], 18000)

    expect(result).toHaveLength(2)
    expect(result[1].unitPricePesos).toBe(18000)
    expect(result[1].overrideReason).toBeNull()
  })

  it('no pasa de 99 unidades', () => {
    const result = addToCart([line({ quantity: 99 })], product, [], 16500)

    expect(result[0].quantity).toBe(99)
  })
})
