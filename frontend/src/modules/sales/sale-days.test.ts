import { expect, it } from 'vitest'
import { effectivePrice, formatSaleDays, isProductSellable, parseSaleDaysInput } from './sale-days'

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

it('usa el precio especial del día de Bogotá', () => {
  const monday = new Date('2026-11-09T15:00:00Z')
  expect(effectivePrice({
    pricePesos: 35000,
    dayPrices: [{ weekday: 1, pricePesos: 30000 }]
  }, monday)).toBe(30000)
  expect(effectivePrice({ pricePesos: 35000, dayPrices: [] }, monday)).toBe(35000)
})

it('formatea los días con nombres legibles', () => {
  expect(formatSaleDays([1, 2, 3, 4])).toBe('Lun, Mar, Mié, Jue')
  expect(formatSaleDays([])).toBe('')
})
