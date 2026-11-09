import { expect, it } from 'vitest'
import { bogotaDate, bogotaWeekday } from './dates'

it('usa la fecha operativa de Bogotá, no la UTC', () => {
  expect(bogotaDate(new Date('2026-11-08T02:00:00.000Z'))).toBe('2026-11-07')
  expect(bogotaDate(new Date('2026-11-07T15:00:00.000Z'))).toBe('2026-11-07')
})

it('calcula el día de la semana en Bogotá', () => {
  expect(bogotaWeekday(new Date('2026-11-09T15:00:00Z'))).toBe(1)
  expect(bogotaWeekday(new Date('2026-11-13T15:00:00Z'))).toBe(5)
  expect(bogotaWeekday(new Date('2026-11-15T15:00:00Z'))).toBe(7)
  expect(bogotaWeekday(new Date('2026-11-10T05:00:00Z'))).toBe(2)
})
