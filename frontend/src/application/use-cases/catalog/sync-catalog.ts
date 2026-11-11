import type { CajaDb, RecipeItemRow } from '../../../infrastructure/database/schema'
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
    modifierGroupIds?: string[]
    components: Array<{ productId: string; name: string; quantity: number }>
    saleDays?: number[]
    addonIds?: string[]
    dayPrices?: Array<{ weekday: number; pricePesos: number }>
    recipe?: RecipeItemRow[]
  }>
  addons?: Array<{
    id: string
    name: string
    pricePesos: number
    active?: boolean
    recipe?: RecipeItemRow[]
  }>
  ingredients?: Array<{
    id: string
    name: string
    unit: 'UNIT' | 'GRAM'
    wastePercent: number
    active: boolean
  }>
  modifierGroups?: Array<{
    id: string
    name: string
    minSelection: number
    maxSelection: number
    active?: boolean
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

  const products = remote.products.map((product) => ({
    ...product,
    addonIds: product.addonIds ?? [],
    dayPrices: product.dayPrices ?? [],
    recipe: product.recipe ?? []
  }))

  await database.transaction(
    'rw',
    database.products,
    database.categories,
    database.modifierGroups,
    database.addons,
    database.meta,
    async () => {
      await database.products.clear()
      await database.categories.clear()
      await database.modifierGroups.clear()
      await database.addons.clear()
      await database.categories.bulkPut(remote.categories)
      await database.products.bulkPut(products)
      await database.addons.bulkPut(remote.addons ?? [])
      await database.meta.put({ key: 'catalogVersion', value: remote.version })
    }
  )
  return remote.version
}
