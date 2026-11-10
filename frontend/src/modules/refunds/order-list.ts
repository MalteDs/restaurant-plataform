import type { SaleRow } from '../../infrastructure/database/schema'

export type OrderStatusFilter = 'ALL' | 'CHARGED' | 'REFUNDED'

export interface OrderFilters {
  date: string | null
  status: OrderStatusFilter
  query: string
}

export function filterOrders(sales: SaleRow[], filters: OrderFilters): SaleRow[] {
  const query = filters.query.trim().toLowerCase()
  return sales
    .filter((sale) => filters.date === null || sale.operationalDate === filters.date)
    .filter((sale) => filters.status === 'ALL' || sale.status === filters.status)
    .filter((sale) => !query || sale.displayCode.toLowerCase().includes(query))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function ordersTotal(sales: SaleRow[]): number {
  return sales.reduce((sum, sale) => sum + sale.totalPesos, 0)
}
