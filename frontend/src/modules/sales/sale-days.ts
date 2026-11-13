import type { ProductRow } from '../../infrastructure/database/schema'
import { bogotaWeekday } from '../../shared/dates'

export const SALE_DAYS = [
  { value: 1, short: 'Lun', label: 'Lunes' },
  { value: 2, short: 'Mar', label: 'Martes' },
  { value: 3, short: 'Mié', label: 'Miércoles' },
  { value: 4, short: 'Jue', label: 'Jueves' },
  { value: 5, short: 'Vie', label: 'Viernes' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
  { value: 7, short: 'Dom', label: 'Domingo' }
] as const

export function isProductSellable(
  product: Pick<ProductRow, 'saleDays'>,
  now = new Date()
): boolean {
  const days = product.saleDays ?? []
  return days.length === 0 || days.includes(bogotaWeekday(now))
}

export function effectivePrice(
  product: Pick<ProductRow, 'pricePesos' | 'dayPrices'>,
  now = new Date()
): number {
  const weekday = bogotaWeekday(now)
  return product.dayPrices?.find((row) => row.weekday === weekday)?.pricePesos
    ?? product.pricePesos
}

export function parseSaleDaysInput(value: string): number[] {
  const days = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
  return [...new Set(days)].sort((left, right) => left - right)
}

export function formatSaleDays(days?: number[]): string {
  return (days ?? [])
    .map((day) => SALE_DAYS.find((item) => item.value === day)?.short)
    .filter(Boolean)
    .join(', ')
}
