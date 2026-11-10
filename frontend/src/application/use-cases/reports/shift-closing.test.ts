import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { openDb, type CajaDb } from '../../../infrastructure/database/schema'
import { exportShiftClosingCsv, shiftClosing } from './shift-closing'

const opened: CajaDb[] = []

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

async function seedClosing() {
  const db = openDb(`test-closing-${crypto.randomUUID()}`)
  opened.push(db)
  await db.shifts.put({
    id: 'shift-1', userId: 'u1', openingCashPesos: 50000,
    openedAt: '2026-11-01T12:00:00.000Z', closedAt: '2026-11-01T22:00:00.000Z',
    countedCashPesos: 50000, expectedPesos: 55500, differencePesos: -5500,
    operationalDate: '2026-11-01', closeNote: 'faltante', closedBy: 'u1',
    countedBreakdown: { '20000': 2, '5000': 2 }
  })
  await db.sales.bulkPut([
    { id: 's1', displayCode: 'ALM-A-1', status: 'CHARGED', totalPesos: 16500,
      type: 'COUNTER', operationalDate: '2026-11-01', createdAt: '2026-11-01T18:00:00.000Z',
      shiftId: 'shift-1', userId: 'u1', deliveryFeePesos: 0 },
    { id: 's2', displayCode: 'ALM-A-2', status: 'CHARGED', totalPesos: 5000,
      type: 'COUNTER', operationalDate: '2026-11-01', createdAt: '2026-11-01T19:00:00.000Z',
      shiftId: 'shift-1', userId: 'u1', deliveryFeePesos: 0 }
  ])
  await db.payments.bulkPut([
    { id: 'p1', saleId: 's1', method: 'CASH', amountPesos: 16500 },
    { id: 'p2', saleId: 's2', method: 'CARD', amountPesos: 5000 }
  ])
  await db.refunds.put({
    id: 'r1', saleId: 's2', shiftId: 'shift-1', amountPesos: 5000, method: 'CASH',
    reason: 'prueba', operationalDate: '2026-11-01'
  })
  await db.cashMovements.bulkPut([
    { id: 'm1', shiftId: 'shift-1', type: 'DEPOSIT', amountPesos: 2000,
      reason: 'cambio', operationalDate: '2026-11-01' },
    { id: 'm2', shiftId: 'shift-1', type: 'WITHDRAWAL', amountPesos: 5000,
      reason: 'retiro', operationalDate: '2026-11-01' },
    { id: 'm3', shiftId: 'shift-1', type: 'WITHDRAWAL', amountPesos: 3000,
      reason: 'lechuga', operationalDate: '2026-11-01', expenseCategoryName: 'Fruver' },
    { id: 'm4', shiftId: 'shift-1', type: 'WITHDRAWAL', amountPesos: 1000,
      reason: 'error', operationalDate: '2026-11-01', expenseCategoryName: 'Aseo',
      voidedAt: '2026-11-01T20:00:00.000Z', voidedBy: 'u1' }
  ])
  return db
}

it('arma el cierre con arqueo, ventas, gastos y denominaciones', async () => {
  const db = await seedClosing()
  const closing = await shiftClosing(db, 'shift-1')

  expect(closing.salesByMethod).toEqual({ CASH: 16500, CARD: 5000, BREB: 0 })
  expect(closing.refundsByMethod).toEqual({ CASH: 5000, CARD: 0, BREB: 0 })
  expect(closing.depositsPesos).toBe(2000)
  expect(closing.withdrawalsPesos).toBe(8000)
  expect(closing.cashExpensesPesos).toBe(3000)
  expect(closing.cashExpensesByCategory).toEqual([{ name: 'Fruver', amountPesos: 3000 }])
  expect(closing.expectedPesos).toBe(55500)
  expect(closing.countedPesos).toBe(50000)
  expect(closing.differencePesos).toBe(-5500)
  expect(closing.countedBreakdown).toEqual({ '20000': 2, '5000': 2 })
})

it('incluye los movimientos anulados como sección de auditoría', async () => {
  const db = await seedClosing()
  const closing = await shiftClosing(db, 'shift-1')

  expect(closing.voidedMovements).toEqual([{
    type: 'WITHDRAWAL', amountPesos: 1000, reason: 'error',
    voidedAt: '2026-11-01T20:00:00.000Z', voidedBy: 'u1'
  }])
})

it('exporta CSV con secciones y sin perder tildes', async () => {
  const db = await seedClosing()
  const blob = exportShiftClosingCsv(await shiftClosing(db, 'shift-1'))
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(blob)
  })

  expect(text).toContain('Apertura')
  expect(text).toContain('Ventas por medio')
  expect(text).toContain('Gastos de caja')
  expect(text).toContain('Arqueo')
  expect(text).toContain('Denominaciones')
  expect(text).toContain('Anulados')
  expect(text).toContain('Fruver')
  expect(text).toContain('55.500')
})
