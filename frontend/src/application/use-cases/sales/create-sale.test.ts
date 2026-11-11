import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { openDb, type CajaDb } from '../../../infrastructure/database/schema'
import { createSale, nextDisplayCode, type SaleInput } from './create-sale'

const opened: CajaDb[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

async function seed() {
  const db = openDb(`test-sale-${crypto.randomUUID()}`)
  opened.push(db)
  await db.users.put({ id: 'u1', username: 'ana', role: 'CASHIER' })
  await db.meta.put({ key: 'activeUserId', value: 'u1' })
  await db.meta.put({ key: 'devicePrefix', value: 'ALM-A' })
  await db.shifts.put({
    id: 'shift-1',
    userId: 'u1',
    openingCashPesos: 50000,
    openedAt: new Date().toISOString(),
    closedAt: null,
    countedCashPesos: null,
    expectedPesos: null,
    differencePesos: null,
    operationalDate: new Date().toISOString().slice(0, 10)
  })
  return db
}

function baseInput(): SaleInput {
  return {
    type: 'COUNTER',
    payments: [{ method: 'CASH', amountPesos: 33000 }],
    items: [
      {
        productId: 'p1',
        productName: 'SENCILLA',
        categoryName: 'HAMBURGUESAS',
        quantity: 2,
        unitPricePesos: 16500,
        catalogUnitPricePesos: 16500,
        costPesos: null,
        modifiers: [],
        components: []
      }
    ]
  }
}

it('guarda venta y operación en la misma transacción', async () => {
  const db = await seed()

  const out = await createSale(db, baseInput())

  const sale = await db.sales.get(out.saleId)
  const operations = await db.operations.where('entityId').equals(out.saleId).toArray()
  expect(sale?.totalPesos).toBe(33000)
  expect(operations).toHaveLength(1)
  expect(operations[0].status).toBe('LOCAL_PENDING')
  expect(operations[0].type).toBe('CREATE_SALE')
})

it('no deja venta si falla la operación', async () => {
  const db = await seed()
  vi.spyOn(db.operations, 'add').mockRejectedValueOnce(new Error('boom'))

  await expect(createSale(db, baseInput())).rejects.toThrow()

  expect(await db.sales.count()).toBe(0)
  expect(await db.saleItems.count()).toBe(0)
  expect(await db.payments.count()).toBe(0)
})

it('numera por dispositivo sin colisión', async () => {
  const db = await seed()

  const first = await nextDisplayCode('ALM-A', db)
  const second = await nextDisplayCode('ALM-A', db)

  expect(first).toBe('ALM-A-000001')
  expect(second).toBe('ALM-A-000002')
})

it('un cajero no puede cambiar el precio', async () => {
  const db = await seed()

  await expect(createSale(db, {
    ...baseInput(),
    payments: [{ method: 'CASH', amountPesos: 28000 }],
    items: [{ ...baseInput().items[0], unitPricePesos: 14000, catalogUnitPricePesos: 16500,
      overrideReason: 'descuento autorizado' }]
  })).rejects.toThrow(/encargado|admin/i)
  expect(await db.sales.count()).toBe(0)
})

it('un encargado guarda precio de lista, aplicado y motivo', async () => {
  const db = await seed()
  await db.users.put({ id: 'u1', username: 'ana', role: 'MANAGER' })

  const out = await createSale(db, {
    ...baseInput(),
    payments: [{ method: 'CASH', amountPesos: 28000 }],
    items: [{ ...baseInput().items[0], unitPricePesos: 14000, catalogUnitPricePesos: 16500,
      overrideReason: 'descuento autorizado' }]
  })

  const item = await db.saleItems.where('saleId').equals(out.saleId).first()
  expect(item).toMatchObject({
    unitPricePesos: 14000,
    catalogUnitPricePesos: 16500,
    overrideReason: 'descuento autorizado',
    overrideUserId: 'u1'
  })
})

it('guarda dos pagos y exige que sumen el total', async () => {
  const db = await seed()
  const item = baseInput().items[0]
  const out = await createSale(db, {
    ...baseInput(),
    items: [{ ...item, quantity: 1, unitPricePesos: 20000, catalogUnitPricePesos: 20000 }],
    payments: [
      { method: 'CASH', amountPesos: 12000 },
      { method: 'CARD', amountPesos: 8000 }
    ]
  })

  expect(await db.payments.where('saleId').equals(out.saleId).count()).toBe(2)
})

it('rechaza pagos que no suman el total', async () => {
  const db = await seed()

  await expect(createSale(db, {
    ...baseInput(),
    payments: [{ method: 'CASH', amountPesos: 19000 }]
  })).rejects.toThrow(/suman|total/i)
  expect(await db.sales.count()).toBe(0)
})

it('guarda nota y orden de línea para el comprobante', async () => {
  const db = await seed()
  const input = baseInput()
  input.items[0].note = 'Sin cebolla'

  const out = await createSale(db, input)
  const stored = await db.saleItems.where('saleId').equals(out.saleId).first()

  expect(stored?.note).toBe('Sin cebolla')
  expect(stored?.lineNumber).toBe(1)
})
