import type { SaleRow } from '../../infrastructure/database/schema'
import { bogotaDate } from '../../shared/dates'

export type OrderStatusFilter = 'ALL' | 'CHARGED' | 'REFUNDED'
export type OrderDatePreset = 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'ALL' | 'CUSTOM'

export interface OrderFilters {
  from: string | null
  to: string | null
  status: OrderStatusFilter
  query: string
}

export interface DateRange {
  from: string | null
  to: string | null
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function presetRange(
  preset: Exclude<OrderDatePreset, 'CUSTOM'>,
  today = bogotaDate()
): DateRange {
  if (preset === 'TODAY') {
    return { from: today, to: today }
  }
  if (preset === 'WEEK') {
    return { from: shiftDate(today, -6), to: today }
  }
  if (preset === 'MONTH') {
    return { from: `${today.slice(0, 7)}-01`, to: today }
  }
  if (preset === 'YEAR') {
    return { from: `${today.slice(0, 4)}-01-01`, to: today }
  }
  return { from: null, to: null }
}

export function filterOrders(sales: SaleRow[], filters: OrderFilters): SaleRow[] {
  const query = filters.query.trim().toLowerCase()
  return sales
    .filter((sale) => filters.from === null || sale.operationalDate >= filters.from)
    .filter((sale) => filters.to === null || sale.operationalDate <= filters.to)
    .filter((sale) => filters.status === 'ALL' || sale.status === filters.status)
    .filter((sale) => !query || sale.displayCode.toLowerCase().includes(query))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function ordersTotal(sales: SaleRow[]): number {
  return sales.reduce((sum, sale) => sum + sale.totalPesos, 0)
}
