import type { ProductRow } from '../../infrastructure/database/schema'
import { bogotaWeekday } from '../../shared/dates'

export function isProductSellable(
  product: Pick<ProductRow, 'saleDays'>,
  now = new Date()
): boolean {
  const days = product.saleDays ?? []
  return days.length === 0 || days.includes(bogotaWeekday(now))
}

export function parseSaleDaysInput(value: string): number[] {
  const days = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
  return [...new Set(days)].sort((left, right) => left - right)
}

export function formatSaleDays(days?: number[]): string {
  return (days ?? []).join(', ')
}
