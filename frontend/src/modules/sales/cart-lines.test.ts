import { describe, expect, it } from 'vitest'
import type { ModifierRow, ProductRow } from '../../infrastructure/database/schema'
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

const modifier = (id: string): ModifierRow => ({
  id,
  name: id,
  additionalPricePesos: 0
})

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    key: crypto.randomUUID(),
    product,
    quantity: 1,
    unitPricePesos: 16500,
    catalogUnitPricePesos: 16500,
    overrideReason: null,
    modifiers: [],
    ...overrides
  }
}

describe('addToCart', () => {
  it('suma cantidad cuando coinciden producto y modificadores', () => {
    const first = addToCart([], product, [modifier('m1')])
    const result = addToCart(first, product, [modifier('m1')])

    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(2)
  })

  it('fusiona aunque los modificadores lleguen en otro orden', () => {
    const first = addToCart([], product, [modifier('m1'), modifier('m2')])
    const result = addToCart(first, product, [modifier('m2'), modifier('m1')])

    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(2)
  })

  it('mantiene líneas separadas con modificadores distintos', () => {
    const first = addToCart([], product, [modifier('m1')])
    const result = addToCart(first, product, [modifier('m2')])

    expect(result).toHaveLength(2)
    expect(result.map((item) => item.quantity)).toEqual([1, 1])
  })

  it('no fusiona una línea con precio cambiado y usa el precio de catálogo', () => {
    const changed = line({ overrideReason: 'descuento', unitPricePesos: 15000 })
    const result = addToCart([changed], product, [])

    expect(result).toHaveLength(2)
    expect(result[1].unitPricePesos).toBe(16500)
    expect(result[1].overrideReason).toBeNull()
  })

  it('no pasa de 99 unidades', () => {
    const result = addToCart([line({ quantity: 99 })], product, [])

    expect(result[0].quantity).toBe(99)
  })
})
