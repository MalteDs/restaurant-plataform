import type { CajaDb } from '../../../infrastructure/database/schema'

export interface LocalSummary {
  salesPesos: number
  refundsPesos: number
  netSalesPesos: number
  cashPesos: number
  cardPesos: number
  brebPesos: number
  orders: number
  refundCount: number
  averageTicketPesos: number
  costPesos: number
  expensesPesos: number
  operatingProfitPesos: number
  byCategory: Array<{ name: string; quantity: number; salesPesos: number }>
  byDay: Array<{ date: string; salesPesos: number }>
  byHour: Array<{ hour: number; salesPesos: number }>
  byProduct: Array<{ name: string; quantity: number; salesPesos: number }>
}

function hourInBogota(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    hour12: false
  }).formatToParts(new Date(iso))
  return Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const group = groups.get(key(row)) ?? []
    group.push(row)
    groups.set(key(row), group)
  }
  return groups
}

export async function localSummary(
  database: CajaDb,
  from: string,
  to: string
): Promise<LocalSummary> {
  const sales = (await database.sales.toArray())
    .filter((sale) => sale.operationalDate >= from && sale.operationalDate <= to)
  const saleIds = new Set(sales.map((sale) => sale.id))
  const payments = (await database.payments.toArray())
    .filter((payment) => saleIds.has(payment.saleId))
  const items = (await database.saleItems.toArray())
    .filter((item) => saleIds.has(item.saleId))
  const refunds = (await database.refunds.toArray())
    .filter((refund) => refund.operationalDate >= from && refund.operationalDate <= to)

  const sumPayments = (method: string) => payments
    .filter((payment) => payment.method === method)
    .reduce((sum, payment) => sum + payment.amountPesos, 0)
  const salesPesos = sales.reduce((sum, sale) => sum + sale.totalPesos, 0)
  const refundsPesos = refunds.reduce((sum, refund) => sum + refund.amountPesos, 0)
  const costPesos = items.reduce((sum, item) => sum + (item.costPesos ?? 0) * item.quantity, 0)
  const netSalesPesos = salesPesos - refundsPesos
  const orders = sales.length

  const byCategory = [...groupBy(items, (item) => item.categoryName).entries()]
    .map(([name, rows]) => ({
      name,
      quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      salesPesos: rows.reduce((sum, row) => sum + row.lineTotalPesos, 0)
    }))
    .sort((left, right) => right.salesPesos - left.salesPesos)
  const byProduct = [...groupBy(items, (item) => item.productName).entries()]
    .map(([name, rows]) => ({
      name,
      quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      salesPesos: rows.reduce((sum, row) => sum + row.lineTotalPesos, 0)
    }))
    .sort((left, right) => right.salesPesos - left.salesPesos)
  const byDay = [...groupBy(sales, (sale) => sale.operationalDate).entries()]
    .map(([date, rows]) => ({
      date,
      salesPesos: rows.reduce((sum, row) => sum + row.totalPesos, 0)
    }))
    .sort((left, right) => left.date.localeCompare(right.date))
  const byHour = [...groupBy(sales, (sale) => String(hourInBogota(sale.createdAt))).entries()]
    .map(([hour, rows]) => ({
      hour: Number(hour),
      salesPesos: rows.reduce((sum, row) => sum + row.totalPesos, 0)
    }))
    .sort((left, right) => left.hour - right.hour)

  return {
    salesPesos,
    refundsPesos,
    netSalesPesos,
    cashPesos: sumPayments('CASH'),
    cardPesos: sumPayments('CARD'),
    brebPesos: sumPayments('BREB'),
    orders,
    refundCount: refunds.length,
    averageTicketPesos: orders === 0 ? 0 : Math.round(netSalesPesos / orders),
    costPesos,
    expensesPesos: 0,
    operatingProfitPesos: netSalesPesos - costPesos,
    byCategory,
    byDay,
    byHour,
    byProduct
  }
}

export function exportSummaryCsv(summary: LocalSummary): Blob {
  const lines = [
    'fecha;ventas;neto',
    `${summary.byDay[0]?.date ?? ''};${summary.salesPesos};${summary.netSalesPesos}`,
    '',
    'día;ventas',
    ...summary.byDay.map((day) => `${day.date};${day.salesPesos}`),
    '',
    'Categoría;cantidad;ventas',
    ...summary.byCategory.map((row) => `${row.name};${row.quantity};${row.salesPesos}`),
    '',
    'Producto;cantidad;ventas',
    ...summary.byProduct.map((row) => `${row.name};${row.quantity};${row.salesPesos}`),
    '',
    'Hora;ventas',
    ...summary.byHour.map((row) => `${row.hour};${row.salesPesos}`)
  ]
  return new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
}
