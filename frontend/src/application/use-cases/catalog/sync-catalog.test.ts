import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { openDb } from '../../../infrastructure/database/schema'
import { syncCatalog } from './sync-catalog'

const opened: Array<ReturnType<typeof openDb>> = []

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

const snapshot = {
  version: 3,
  categories: [{ id: 'c1', name: 'HAMBURGUESAS', sortOrder: 1, active: true }],
  products: [
    {
      id: 'p1',
      categoryId: 'c1',
      categoryName: 'HAMBURGUESAS',
      kind: 'PRODUCT' as const,
      name: 'SENCILLA',
      pricePesos: 16500,
      costPesos: null,
      sortOrder: 1,
      active: true,
      modifierGroupIds: [],
      components: []
    }
  ],
  modifierGroups: []
}

it('sincroniza el catalogo y no reescribe si la version no cambio', async () => {
  const db = openDb('test-catalog')
  opened.push(db)
  let calls = 0
  const fetchCatalog = async () => {
    calls++
    return snapshot
  }

  expect(await syncCatalog(db, fetchCatalog)).toBe(3)
  expect(await db.products.count()).toBe(1)
  expect(await db.meta.get('catalogVersion')).toMatchObject({ value: 3 })

  await db.products.put({
    id: 'local',
    name: 'Local',
    categoryName: 'X',
    kind: 'PRODUCT',
    pricePesos: 100,
    costPesos: null,
    sortOrder: 0,
    active: true,
    modifierGroupIds: [],
    components: []
  })
  expect(await syncCatalog(db, fetchCatalog)).toBe(3)
  expect(calls).toBe(2)
  // The same version must not clear or duplicate the local catalog.
  expect(await db.products.get('local')).toBeDefined()
  expect(await db.products.count()).toBe(2)
})
