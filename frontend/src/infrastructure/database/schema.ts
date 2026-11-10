import Dexie, { type Table } from 'dexie'
import { DEFAULT_EXPENSE_CATEGORIES } from '../../shared/expense-categories'

export type Role = 'CASHIER' | 'MANAGER' | 'ADMIN'

export interface CategoryRow {
  id: string
  name: string
  sortOrder: number
  active: boolean
}

export interface ComponentRow {
  productId: string
  name: string
  quantity: number
}

export interface ProductRow {
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
  components: ComponentRow[]
  saleDays?: number[]
}

export interface ModifierRow {
  id: string
  name: string
  additionalPricePesos: number
}

export interface ModifierGroupRow {
  id: string
  name: string
  minSelection: number
  maxSelection: number
  modifiers: ModifierRow[]
}

export interface SaleRow {
  id: string
  displayCode: string
  status: 'CHARGED' | 'REFUNDED'
  totalPesos: number
  type: 'COUNTER' | 'DELIVERY' | 'DINE_IN'
  method?: 'CASH' | 'CARD' | 'BREB'
  operationalDate: string
  createdAt: string
  shiftId: string
  userId: string
  tableLabel?: string | null
  deliveryFeePesos: number
}

export interface SaleItemRow {
  id: string
  saleId: string
  productId: string
  productName: string
  categoryName: string
  quantity: number
  unitPricePesos: number
  costPesos: number | null
  lineTotalPesos: number
  note?: string | null
  lineNumber?: number
  modifiers: ModifierRow[]
  components: ComponentRow[]
  catalogUnitPricePesos?: number
  overrideReason?: string | null
  overrideUserId?: string | null
}

export interface PaymentRow {
  id: string
  saleId: string
  method: 'CASH' | 'CARD' | 'BREB'
  amountPesos: number
}

export interface ShiftRow {
  id: string
  userId: string
  openingCashPesos: number
  openedAt: string
  closedAt: string | null
  countedCashPesos: number | null
  expectedPesos: number | null
  differencePesos: number | null
  operationalDate: string
  countedBreakdown?: Record<string, number> | null
  closeNote?: string | null
  closedBy?: string | null
}

export interface CashMovementRow {
  id: string
  shiftId: string
  userId?: string
  type: 'DEPOSIT' | 'WITHDRAWAL'
  amountPesos: number
  reason: string
  operationalDate: string
  expenseCategoryName?: string | null
  voidedAt?: string | null
  voidedBy?: string | null
  replacesMovementId?: string | null
}

export interface ExpenseCategoryRow {
  name: string
  sortOrder: number
  active: boolean
}

export interface RefundRow {
  id: string
  saleId: string
  shiftId: string
  amountPesos: number
  method: 'CASH' | 'CARD' | 'BREB'
  reason: string
  operationalDate: string
}

export type OperationStatus = 'LOCAL_PENDING' | 'SYNCED' | 'SYNC_ERROR'

export interface OperationRow {
  operationId: string
  seq: number
  type: 'CREATE_SALE' | 'REFUND_SALE' | 'OPEN_SHIFT' | 'CASH_MOVEMENT' | 'CLOSE_SHIFT'
  entityId?: string
  userId: string
  clientCreatedAt: string
  payload: unknown
  status: OperationStatus
  attempts: number
  nextRetryAt?: string
  error?: string
}

export interface MetaRow {
  key: string
  value: unknown
}

export interface UserRow {
  id: string
  username: string
  role: Role
  tenantId?: string
  locationId?: string
  pinHash?: string
  deviceToken?: string
  sessionCreatedAt?: string
  sessionExpiresAt?: string
}

export class CajaDb extends Dexie {
  products!: Table<ProductRow, string>
  categories!: Table<CategoryRow, string>
  modifierGroups!: Table<ModifierGroupRow, string>
  sales!: Table<SaleRow, string>
  saleItems!: Table<SaleItemRow, string>
  payments!: Table<PaymentRow, string>
  shifts!: Table<ShiftRow, string>
  cashMovements!: Table<CashMovementRow, string>
  refunds!: Table<RefundRow, string>
  operations!: Table<OperationRow, string>
  meta!: Table<MetaRow, string>
  users!: Table<UserRow, string>
  expenseCategories!: Table<ExpenseCategoryRow, string>

  constructor(name = 'caja') {
    super(name)
    this.version(1).stores({
      products: 'id, categoryId, name, active',
      categories: 'id, sortOrder',
      modifierGroups: 'id',
      sales: 'id, status, operationalDate',
      saleItems: 'id, saleId',
      payments: 'id, saleId',
      shifts: 'id, closedAt',
      cashMovements: 'id, shiftId',
      refunds: 'id, saleId',
      operations: 'operationId, seq, status, entityId',
      meta: 'key',
      users: 'id, username'
    })
    this.version(2).stores({
      operations: 'operationId, seq, status, entityId, type'
    })
    this.version(3).stores({
      sales: 'id, status, operationalDate, createdAt'
    })
    this.version(4).stores({
      expenseCategories: 'name, sortOrder'
    }).upgrade(async (tx) => {
      await tx.table('expenseCategories').bulkPut(DEFAULT_EXPENSE_CATEGORIES)
    })
    this.on('populate', async (tx) => {
      await tx.table('expenseCategories').bulkPut(DEFAULT_EXPENSE_CATEGORIES)
    })
  }
}

export function openDb(name?: string): CajaDb {
  return new CajaDb(name)
}

export const db = new CajaDb()
