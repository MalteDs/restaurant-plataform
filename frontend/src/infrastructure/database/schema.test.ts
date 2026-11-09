import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, expect, it } from 'vitest'
import { openDb } from './schema'

const opened: Array<ReturnType<typeof openDb>> = []

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

it('sobrevive a cerrar y reabrir la base', async () => {
  const db = openDb('test-persist')
  opened.push(db)
  await db.products.put({
    id: 'p1',
    name: 'Sencilla',
    categoryName: 'HAMBURGUESAS',
    kind: 'PRODUCT',
    pricePesos: 16500,
    costPesos: null,
    sortOrder: 1,
    active: true,
    modifierGroupIds: [],
    components: []
  })
  db.close()

  const reopened = openDb('test-persist')
  opened.push(reopened)
  expect((await reopened.products.get('p1'))?.pricePesos).toBe(16500)
})

it('conserva las ventas al agregar el índice createdAt', async () => {
  const name = `test-upgrade-${crypto.randomUUID()}`
  const previous = new Dexie(name)
  previous.version(2).stores({ sales: 'id, status, operationalDate' })
  await previous.open()
  await previous.table('sales').put({
    id: 's1',
    displayCode: 'ALM-A-000001',
    status: 'CHARGED',
    totalPesos: 16500,
    type: 'COUNTER',
    method: 'CASH',
    operationalDate: '2026-11-07',
    createdAt: '2026-11-07T15:00:00.000Z',
    shiftId: 'shift-1',
    userId: 'u1',
    deliveryFeePesos: 0
  })
  previous.close()

  const upgraded = openDb(name)
  opened.push(upgraded)

  expect(await upgraded.sales.get('s1')).toMatchObject({ displayCode: 'ALM-A-000001' })
  await expect(upgraded.sales.orderBy('createdAt').toArray()).resolves.toHaveLength(1)
})
