import { expect, it } from 'vitest'
import type { SaleRow } from '../../infrastructure/database/schema'
import { filterOrders, ordersTotal } from './order-list'

function sale(overrides: Partial<SaleRow>): SaleRow {
  return {
    id: 's', displayCode: 'ALM-A-1', status: 'CHARGED', totalPesos: 1000,
    type: 'COUNTER', operationalDate: '2026-11-10',
    createdAt: '2026-11-10T15:00:00.000Z', shiftId: 'sh', userId: 'u',
    deliveryFeePesos: 0, ...overrides
  }
}

it('filtra por día, estado y código y ordena por fecha descendente', () => {
  const rows = [
    sale({ id: '1', displayCode: 'ALM-A-1', createdAt: '2026-11-10T15:00:00.000Z' }),
    sale({ id: '2', displayCode: 'ALM-A-2', status: 'REFUNDED', createdAt: '2026-11-10T16:00:00.000Z' }),
    sale({ id: '3', displayCode: 'ALM-B-3', operationalDate: '2026-11-09' })
  ]

  expect(filterOrders(rows, { date: '2026-11-10', status: 'ALL', query: '' }).map((s) => s.id))
    .toEqual(['2', '1'])
  expect(filterOrders(rows, { date: '2026-11-10', status: 'REFUNDED', query: '' }).map((s) => s.id))
    .toEqual(['2'])
  expect(filterOrders(rows, { date: null, status: 'ALL', query: 'b-3' }).map((s) => s.id))
    .toEqual(['3'])
})

it('suma el total de las ventas', () => {
  expect(ordersTotal([sale({ totalPesos: 16500 }), sale({ totalPesos: 2000 })])).toBe(18500)
})
