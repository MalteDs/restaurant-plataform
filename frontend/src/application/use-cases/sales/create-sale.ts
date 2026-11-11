import { notifyOperationQueued } from '../../../infrastructure/synchronization/notify'
import { db, type CajaDb, type ComponentRow, type SaleAddonRow } from '../../../infrastructure/database/schema'
import { activeUserId } from '../../../modules/auth/session'

export interface SaleItemInput {
  productId: string
  productName: string
  categoryName: string
  quantity: number
  unitPricePesos: number
  catalogUnitPricePesos: number
  costPesos: number | null
  note?: string | null
  overrideReason?: string | null
  addons: SaleAddonRow[]
  components: ComponentRow[]
}

export interface SalePaymentInput {
  method: 'CASH' | 'CARD' | 'BREB'
  amountPesos: number
}

export interface SaleInput {
  type: 'COUNTER' | 'DELIVERY' | 'DINE_IN'
  tableLabel?: string | null
  deliveryFeePesos?: number
  cashReceivedPesos?: number | null
  items: SaleItemInput[]
  payments: SalePaymentInput[]
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

function addonsTotal(item: SaleItemInput): number {
  return item.addons.reduce((sum, addon) => sum + addon.pricePesos * addon.quantity, 0)
}

export function lineTotal(item: SaleItemInput): number {
  return item.quantity * (item.unitPricePesos + addonsTotal(item))
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
  const user = await database.users.get(userId)
  const overrides = input.items.filter(
    (item) => item.unitPricePesos !== item.catalogUnitPricePesos
  )
  if (overrides.length > 0) {
    if (user?.role !== 'MANAGER' && user?.role !== 'ADMIN') {
      throw new Error('Solo encargado o admin puede cambiar precios')
    }
    for (const item of overrides) {
      const reason = item.overrideReason?.trim() ?? ''
      if (reason.length < 5 || reason.length > 200) {
        throw new Error('El cambio de precio necesita un motivo de al menos 5 caracteres')
      }
    }
  }
  const prefixRow = await database.meta.get('devicePrefix')
  const prefix = deps.devicePrefix
    ?? (typeof prefixRow?.value === 'string' ? prefixRow.value : 'ALM-A')
  const now = deps.now ?? new Date()
  const totalPesos = input.items.reduce((sum, item) => sum + lineTotal(item), 0)
    + (input.deliveryFeePesos ?? 0)
  if (!input.payments || input.payments.length === 0) {
    throw new Error('La venta necesita al menos un pago')
  }
  let paid = 0
  for (const payment of input.payments) {
    if (payment.amountPesos < 0 || (totalPesos > 0 && payment.amountPesos === 0)) {
      throw new Error('Cada pago debe ser mayor que cero')
    }
    paid += payment.amountPesos
  }
  if (paid !== totalPesos) {
    throw new Error('Los pagos no suman el total de la venta')
  }
  const cashReceivedPesos = input.cashReceivedPesos ?? null
  if (cashReceivedPesos !== null) {
    if (input.payments.length !== 1 || input.payments[0].method !== 'CASH') {
      throw new Error('El efectivo recibido solo aplica a un pago en efectivo')
    }
    if (!Number.isFinite(cashReceivedPesos) || cashReceivedPesos < totalPesos) {
      throw new Error('El efectivo recibido no alcanza el total')
    }
  }

  const created = await database.transaction(
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
        operationalDate,
        createdAt,
        shiftId: shift.id,
        userId,
        tableLabel: input.tableLabel ?? null,
        deliveryFeePesos: input.deliveryFeePesos ?? 0,
        cashReceivedPesos
      })
      await database.saleItems.bulkAdd(
        input.items.map((item, index) => {
          const override = item.unitPricePesos !== item.catalogUnitPricePesos
          return {
            id: crypto.randomUUID(),
            saleId,
            productId: item.productId,
            productName: item.productName,
            categoryName: item.categoryName,
            quantity: item.quantity,
            unitPricePesos: item.unitPricePesos,
            catalogUnitPricePesos: item.catalogUnitPricePesos,
            overrideReason: override ? item.overrideReason ?? null : null,
            overrideUserId: override ? userId : null,
            costPesos: item.costPesos,
            lineTotalPesos: lineTotal(item),
            note: item.note ?? null,
            lineNumber: index + 1,
            addons: item.addons,
            components: item.components
          }
        })
      )
      await database.payments.bulkAdd(input.payments.map((payment) => ({
        id: crypto.randomUUID(),
        saleId,
        method: payment.method,
        amountPesos: payment.amountPesos
      })))
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
          payments: input.payments,
          displayCode,
          deviceSeq,
          items: input.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            categoryName: item.categoryName,
            quantity: item.quantity,
            unitPricePesos: item.unitPricePesos,
            catalogUnitPricePesos: item.catalogUnitPricePesos,
            overrideReason: item.unitPricePesos !== item.catalogUnitPricePesos
              ? item.overrideReason ?? null
              : null,
            costPesos: item.costPesos,
            note: item.note ?? null,
            addons: item.addons.map((addon) => ({
              addonId: addon.id,
              addonName: addon.name,
              additionalPricePesos: addon.pricePesos,
              quantity: addon.quantity
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
  notifyOperationQueued()
  return created
}
