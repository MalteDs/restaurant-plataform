import type { CajaDb } from '../../../infrastructure/database/schema'
import { request } from '../../../infrastructure/api/client'

export interface CatalogSnapshotPayload {
  version: number
  categories: Array<{ id: string; name: string; sortOrder: number; active: boolean }>
  products: Array<{
    id: string
    tenantId?: string
    locationId?: string
    categoryId?: string | null
    categoryName: string
    kind: 'PRODUCT' | 'COMBO'
    name: string
    pricePesos: number
    costPesos: number | null
    sortOrder: number
    active: boolean
    modifierGroupIds: string[]
    components: Array<{ productId: string; name: string; quantity: number }>
  }>
  modifierGroups: Array<{
    id: string
    name: string
    minSelection: number
    maxSelection: number
    modifiers: Array<{ id: string; name: string; additionalPricePesos: number }>
  }>
}

const loadRemoteCatalog = () => request<CatalogSnapshotPayload>('/api/catalog')

export async function syncCatalog(
  database: CajaDb,
  fetchCatalog: () => Promise<CatalogSnapshotPayload> = loadRemoteCatalog
): Promise<number> {
  const remote = await fetchCatalog()
  const localMeta = await database.meta.get('catalogVersion')
  const localVersion = typeof localMeta?.value === 'number' ? localMeta.value : 0
  if (remote.version <= localVersion) {
    return localVersion
  }

  await database.transaction(
    'rw',
    database.products,
    database.categories,
    database.modifierGroups,
    database.meta,
    async () => {
      await database.products.clear()
      await database.categories.clear()
      await database.modifierGroups.clear()
      await database.categories.bulkPut(remote.categories)
      await database.products.bulkPut(remote.products)
      await database.modifierGroups.bulkPut(remote.modifierGroups)
      await database.meta.put({ key: 'catalogVersion', value: remote.version })
    }
  )
  return remote.version
}
