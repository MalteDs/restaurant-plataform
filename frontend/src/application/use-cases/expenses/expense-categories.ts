import { request } from '../../../infrastructure/api/client'
import type { CajaDb } from '../../../infrastructure/database/schema'

export interface ExpenseCategoryDto {
  id: string
  name: string
  sortOrder: number
  active: boolean
}

export async function refreshExpenseCategories(
  database: CajaDb,
  fetcher: (path: string) => Promise<ExpenseCategoryDto[]> = (path) =>
    request<ExpenseCategoryDto[]>(path)
): Promise<void> {
  const categories = await fetcher('/api/expenses/categories')
  const active = categories
    .filter((category) => category.active)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
  if (active.length === 0) {
    return
  }
  await database.transaction('rw', database.expenseCategories, async () => {
    await database.expenseCategories.clear()
    await database.expenseCategories.bulkPut(
      active.map((category) => ({
        name: category.name,
        sortOrder: category.sortOrder,
        active: true
      }))
    )
  })
}

export async function availableExpenseCategories(database: CajaDb): Promise<string[]> {
  const rows = await database.expenseCategories.orderBy('sortOrder').toArray()
  const names = rows.filter((row) => row.active).map((row) => row.name)
  return names.length > 0 ? names : ['Otros']
}
