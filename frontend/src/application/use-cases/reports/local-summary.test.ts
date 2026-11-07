import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { openDb, type CajaDb } from '../../../infrastructure/database/schema'
import { exportSummaryCsv, localSummary } from './local-summary'

const opened: CajaDb[] = []

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

async function seed() {
  const db = openDb(`test-summary-${crypto.randomUUID()}`)
  opened.push(db)
  await db.sales.bulkPut([
    {
      id: 's1', displayCode: 'ALM-A-1', status: 'CHARGED', totalPesos: 33000, type: 'COUNTER',
      method: 'CASH', operationalDate: '2026-11-01', createdAt: '2026-11-01T18:00:00.000Z',
      shiftId: 'shift-1', userId: 'u1', deliveryFeePesos: 0
    },
    {
      id: 's2', displayCode: 'ALM-A-2', status: 'CHARGED', totalPesos: 18500, type: 'COUNTER',
      method: 'CARD', operationalDate: '2026-11-01', createdAt: '2026-11-01T19:00:00.000Z',
      shiftId: 'shift-1', userId: 'u1', deliveryFeePesos: 0
    },
    {
      id: 's3', displayCode: 'ALM-A-3', status: 'CHARGED', totalPesos: 99999, type: 'COUNTER',
      method: 'CASH', operationalDate: '2026-11-02', createdAt: '2026-11-02T18:00:00.000Z',
      shiftId: 'shift-1', userId: 'u1', deliveryFeePesos: 0
    }
  ])
  await db.payments.bulkPut([
    { id: 'p1', saleId: 's1', method: 'CASH', amountPesos: 33000 },
    { id: 'p2', saleId: 's2', method: 'CARD', amountPesos: 18500 },
    { id: 'p3', saleId: 's3', method: 'CASH', amountPesos: 99999 }
  ])
  await db.saleItems.bulkPut([
    {
      id: 'i1', saleId: 's1', productId: 'prod1', productName: 'SENCILLA',
      categoryName: 'HAMBURGUESAS', quantity: 2, unitPricePesos: 16500, costPesos: 5000,
      lineTotalPesos: 33000, modifiers: [], components: []
    },
    {
      id: 'i2', saleId: 's2', productId: 'prod2', productName: 'AGUA',
      categoryName: 'BEBIDAS', quantity: 1, unitPricePesos: 18500, costPesos: 0,
      lineTotalPesos: 18500, modifiers: [], components: []
    }
  ])
  await db.refunds.put({
    id: 'r1', saleId: 's2', shiftId: 'shift-1', amountPesos: 5000, method: 'CASH',
    reason: 'prueba', operationalDate: '2026-11-01'
  })
  return db
}

it('el resumen local calcula el neto y el desglose por categoria', async () => {
  const db = await seed()

  const summary = await localSummary(db, '2026-11-01', '2026-11-01')

  expect(summary.salesPesos).toBe(51500)
  expect(summary.refundsPesos).toBe(5000)
  expect(summary.netSalesPesos).toBe(46500)
  expect(summary.cashPesos).toBe(33000)
  expect(summary.cardPesos).toBe(18500)
  expect(summary.orders).toBe(2)
  expect(summary.costPesos).toBe(10000)
  expect(summary.byCategory).toHaveLength(2)
  expect(summary.byProduct[0].name).toBe('SENCILLA')
})

it('exporta CSV con encabezado y sin perder tildes', async () => {
  const db = await seed()
  const blob = exportSummaryCsv(await localSummary(db, '2026-11-01', '2026-11-01'))

  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })

  expect(text).toContain('fecha;ventas;neto')
  expect(text).toContain('Categoría')
  expect(text).toContain('SENCILLA')
})
