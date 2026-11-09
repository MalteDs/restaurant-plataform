import { expect, it } from 'vitest'
import { isProductSellable, parseSaleDaysInput } from './sale-days'

it('un producto con días solo se vende esos días', () => {
  expect(isProductSellable({ saleDays: [1, 2, 3, 4] }, new Date('2026-11-09T15:00:00Z'))).toBe(true)
  expect(isProductSellable({ saleDays: [1, 2, 3, 4] }, new Date('2026-11-13T15:00:00Z'))).toBe(false)
  expect(isProductSellable({}, new Date('2026-11-13T15:00:00Z'))).toBe(true)
})

it('normaliza el texto de días del admin', () => {
  expect(parseSaleDaysInput('')).toEqual([])
  expect(parseSaleDaysInput('4, 2, 2, 1')).toEqual([1, 2, 4])
  expect(parseSaleDaysInput('0, 8, x')).toEqual([])
})
