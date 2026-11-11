import { expect, it } from 'vitest'
import { saleItemAddons } from './addons'

it('lee los adicionales de una venta nueva', () => {
  expect(saleItemAddons({
    addons: [{ id: 'a1', name: 'Tocineta', pricePesos: 5000, quantity: 2 }]
  })).toEqual([{ id: 'a1', name: 'Tocineta', pricePesos: 5000, quantity: 2 }])
})

it('lee los modificadores de una venta anterior', () => {
  expect(saleItemAddons({
    modifiers: [{ id: 'm1', name: 'Queso', additionalPricePesos: 1000 }]
  })).toEqual([{ id: 'm1', name: 'Queso', pricePesos: 1000, quantity: 1 }])
})
