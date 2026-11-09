import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { openDb, type CajaDb, type SaleRow } from '../../../infrastructure/database/schema'
import { closeShift } from './close-shift'

const opened: CajaDb[] = []

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

const today = new Date().toISOString().slice(0, 10)

function sale(id: string, totalPesos: number): SaleRow {
  return {
    id,
    displayCode: `ALM-A-${id}`,
    status: 'CHARGED',
    totalPesos,
    type: 'COUNTER',
    method: 'CASH',
    operationalDate: today,
    createdAt: new Date().toISOString(),
    shiftId: 'shift-1',
    userId: 'u1',
    deliveryFeePesos: 0
  }
}

async function seed() {
  const db = openDb(`test-close-${crypto.randomUUID()}`)
  opened.push(db)
  await db.users.put({ id: 'u1', username: 'ana', role: 'CASHIER' })
  await db.meta.put({ key: 'activeUserId', value: 'u1' })
  await db.shifts.put({
    id: 'shift-1',
    userId: 'u1',
    openingCashPesos: 50000,
    openedAt: new Date().toISOString(),
    closedAt: null,
    countedCashPesos: null,
    expectedPesos: null,
    differencePesos: null,
    operationalDate: today
  })
  return db
}

it('calcula el arqueo sin red', async () => {
  const db = await seed()
  await db.sales.bulkPut([sale('s1', 16500), sale('s2', 5000)])
  await db.payments.bulkPut([
    { id: 'p1', saleId: 's1', method: 'CASH', amountPesos: 13500 },
    { id: 'p3', saleId: 's1', method: 'CARD', amountPesos: 3000 },
    { id: 'p2', saleId: 's2', method: 'CASH', amountPesos: 5000 }
  ])
  await db.refunds.put({
    id: 'r1',
    saleId: 's2',
    shiftId: 'shift-1',
    amountPesos: 5000,
    method: 'CASH',
    reason: 'cobro equivocado',
    operationalDate: today
  })

  const result = await closeShift(db, { countedCashPesos: 60000 })

  // 50000 + 13500 + 5000 - 5000 = 63500; el pago con tarjeta no entra al arqueo
  expect(result.expectedPesos).toBe(63500)
  expect(result.differencePesos).toBe(-3500)
  const operation = await db.operations.where('type').equals('CLOSE_SHIFT').first()
  expect(operation?.status).toBe('LOCAL_PENDING')
  expect(operation?.payload).toMatchObject({ expectedPesos: 63500, differencePesos: -3500 })
})
