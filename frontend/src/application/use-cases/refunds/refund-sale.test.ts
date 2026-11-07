import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { openDb, type CajaDb } from '../../../infrastructure/database/schema'
import { refundSale } from './refund-sale'

const opened: CajaDb[] = []

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

async function seedPaidSale(totalPesos: number) {
  const db = openDb(`test-refund-${crypto.randomUUID()}`)
  opened.push(db)
  const today = new Date().toISOString().slice(0, 10)
  await db.users.put({ id: 'u1', username: 'ana', role: 'CASHIER' })
  await db.meta.put({ key: 'activeUserId', value: 'u1' })
  await db.shifts.put({
    id: 'shift-1', userId: 'u1', openingCashPesos: 50000, openedAt: new Date().toISOString(),
    closedAt: null, countedCashPesos: null, expectedPesos: null, differencePesos: null,
    operationalDate: today
  })
  await db.sales.put({
    id: 'sale-1', displayCode: 'ALM-A-1', status: 'CHARGED', totalPesos, type: 'COUNTER',
    method: 'CASH', operationalDate: today, createdAt: new Date().toISOString(),
    shiftId: 'shift-1', userId: 'u1', deliveryFeePesos: 0
  })
  return db
}

it('devuelve offline con motivo y encola la operación', async () => {
  const db = await seedPaidSale(16500)

  await expect(refundSale({ saleId: 'sale-1', reason: '', userId: 'u1' }, db))
    .rejects.toThrow()

  const result = await refundSale({ saleId: 'sale-1', reason: 'cobro equivocado', userId: 'u1' }, db)

  expect(result.amountPesos).toBe(16500)
  expect((await db.sales.get('sale-1'))?.status).toBe('REFUNDED')
  const operation = await db.operations.where('type').equals('REFUND_SALE').first()
  expect(operation?.status).toBe('LOCAL_PENDING')
  expect(operation?.payload).toMatchObject({ saleId: 'sale-1', reason: 'cobro equivocado' })
})
