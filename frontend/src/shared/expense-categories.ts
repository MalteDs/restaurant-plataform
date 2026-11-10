import type { ExpenseCategoryRow } from '../infrastructure/database/schema'

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategoryRow[] = [
  { name: 'Domicilios', sortOrder: 1, active: true },
  { name: 'Fruver', sortOrder: 2, active: true },
  { name: 'Insumos', sortOrder: 3, active: true },
  { name: 'Aseo', sortOrder: 4, active: true },
  { name: 'Servicios', sortOrder: 5, active: true },
  { name: 'Otros', sortOrder: 6, active: true }
]
