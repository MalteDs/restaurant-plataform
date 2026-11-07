import 'fake-indexeddb/auto'
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
