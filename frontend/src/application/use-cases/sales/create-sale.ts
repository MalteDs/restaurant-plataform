import { db, type CajaDb, type ComponentRow, type ModifierRow } from '../../../infrastructure/database/schema'
import { activeUserId } from '../../../modules/auth/session'

export interface SaleItemInput {
  productId: string
  productName: string
  categoryName: string
  quantity: number
  unitPricePesos: number
  costPesos: number | null
  note?: string | null
  modifiers: ModifierRow[]
  components: ComponentRow[]
}

export interface SaleInput {
  type: 'COUNTER' | 'DELIVERY' | 'DINE_IN'
  tableLabel?: string | null
  deliveryFeePesos?: number
  items: SaleItemInput[]
  method: 'CASH' | 'CARD' | 'BREB'
}

export interface CreatedSale {
  saleId: string
  displayCode: string
  totalPesos: number
}

export interface CreateSaleDeps {
  activeUserId?: (database: CajaDb) => Promise<string | null>
  devicePrefix?: string
  now?: Date
}

function modifiersTotal(item: SaleItemInput): number {
  return item.modifiers.reduce((sum, modifier) => sum + modifier.additionalPricePesos, 0)
}

export function lineTotal(item: SaleItemInput): number {
  return item.quantity * (item.unitPricePesos + modifiersTotal(item))
}

function localDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now)
}

async function bump(database: CajaDb, key: string) {
  const row = await database.meta.get(key)
  const next = (typeof row?.value === 'number' ? row.value : 0) + 1
  await database.meta.put({ key, value: next })
  return next
}

export async function nextDisplayCode(prefix: string, database: CajaDb = db): Promise<string> {
  const sequence = await database.transaction('rw', database.meta, () =>
    bump(database, `displaySeq:${prefix}`)
  )
  return `${prefix}-${String(sequence).padStart(6, '0')}`
}

export async function createSale(
  database: CajaDb,
  input: SaleInput,
  deps: CreateSaleDeps = {}
): Promise<CreatedSale> {
  const shift = (await database.shifts.toArray()).find((row) => row.closedAt === null)
  if (!shift) {
    throw new Error('No hay turno abierto')
  }
  const userId = deps.activeUserId ? await deps.activeUserId(database) : await activeUserId(database)
  if (!userId) {
    throw new Error('No hay usuario activo')
  }
  const prefixRow = await database.meta.get('devicePrefix')
  const prefix = deps.devicePrefix
    ?? (typeof prefixRow?.value === 'string' ? prefixRow.value : 'ALM-A')
  const now = deps.now ?? new Date()
  const totalPesos = input.items.reduce((sum, item) => sum + lineTotal(item), 0)
    + (input.deliveryFeePesos ?? 0)

  return database.transaction(
    'rw',
    [database.sales, database.saleItems, database.payments, database.operations, database.meta],
    async () => {
      const deviceSeq = await bump(database, `displaySeq:${prefix}`)
      const operationSeq = await bump(database, 'operationSeq')
      const saleId = crypto.randomUUID()
      const displayCode = `${prefix}-${String(deviceSeq).padStart(6, '0')}`
      const createdAt = now.toISOString()
      const operationalDate = localDate(now)

      await database.sales.add({
        id: saleId,
        displayCode,
        status: 'CHARGED',
        totalPesos,
        type: input.type,
        method: input.method,
        operationalDate,
        createdAt,
        shiftId: shift.id,
        userId,
        tableLabel: input.tableLabel ?? null,
        deliveryFeePesos: input.deliveryFeePesos ?? 0
      })
      await database.saleItems.bulkAdd(
        input.items.map((item) => ({
          id: crypto.randomUUID(),
          saleId,
          productId: item.productId,
          productName: item.productName,
          categoryName: item.categoryName,
          quantity: item.quantity,
          unitPricePesos: item.unitPricePesos,
          costPesos: item.costPesos,
          lineTotalPesos: lineTotal(item),
          modifiers: item.modifiers,
          components: item.components
        }))
      )
      await database.payments.add({
        id: crypto.randomUUID(),
        saleId,
        method: input.method,
        amountPesos: totalPesos
      })
      await database.operations.add({
        operationId: crypto.randomUUID(),
        seq: operationSeq,
        type: 'CREATE_SALE',
        entityId: saleId,
        userId,
        clientCreatedAt: createdAt,
        status: 'LOCAL_PENDING',
        attempts: 0,
        payload: {
          type: input.type,
          tableLabel: input.tableLabel ?? null,
          deliveryFeePesos: input.deliveryFeePesos ?? 0,
          shiftId: shift.id,
          method: input.method,
          displayCode,
          deviceSeq,
          items: input.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            categoryName: item.categoryName,
            quantity: item.quantity,
            unitPricePesos: item.unitPricePesos,
            costPesos: item.costPesos,
            note: item.note ?? null,
            modifiers: item.modifiers.map((modifier) => ({
              modifierId: modifier.id,
              modifierName: modifier.name,
              additionalPricePesos: modifier.additionalPricePesos
            })),
            components: item.components.map((component) => ({
              productId: component.productId,
              name: component.name,
              quantity: component.quantity
            }))
          }))
        }
      })

      return { saleId, displayCode, totalPesos }
    }
  )
}
