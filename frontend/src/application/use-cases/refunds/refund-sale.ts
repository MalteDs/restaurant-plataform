import { notifyOperationQueued } from '../../../infrastructure/synchronization/notify'
import { db, type CajaDb } from '../../../infrastructure/database/schema'
import { activeUserId } from '../../../modules/auth/session'

export interface RefundInput {
  saleId: string
  reason: string
  userId?: string
}

export interface RefundResult {
  refundId: string
  amountPesos: number
}

function localDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now)
}

export async function refundSale(
  input: RefundInput,
  database: CajaDb = db,
  now = new Date()
): Promise<RefundResult> {
  const reason = input.reason.trim()
  if (!reason) {
    throw new Error('El motivo es obligatorio')
  }
  const shift = (await database.shifts.toArray()).find((row) => row.closedAt === null)
  if (!shift) {
    throw new Error('No hay turno abierto')
  }
  const userId = input.userId ?? (await activeUserId(database))
  if (!userId) {
    throw new Error('No hay usuario activo')
  }

  const refundId = crypto.randomUUID()
  const result = await database.transaction('rw', [database.refunds, database.sales, database.operations, database.meta],
    async () => {
      // Read inside the write transaction so two taps cannot both refund the same sale.
      const sale = await database.sales.get(input.saleId)
      if (!sale) {
        throw new Error('La venta no existe')
      }
      if (sale.status === 'REFUNDED') {
        throw new Error('La venta ya fue devuelta')
      }
      const sequenceRow = await database.meta.get('operationSeq')
      const seq = (typeof sequenceRow?.value === 'number' ? sequenceRow.value : 0) + 1
      await database.meta.put({ key: 'operationSeq', value: seq })

      await database.refunds.add({
        id: refundId,
        saleId: sale.id,
        shiftId: shift.id,
        amountPesos: sale.totalPesos,
        method: sale.method,
        reason,
        operationalDate: localDate(now)
      })
      await database.sales.update(sale.id, { status: 'REFUNDED' })
      await database.operations.add({
        operationId: crypto.randomUUID(),
        seq,
        type: 'REFUND_SALE',
        entityId: sale.id,
        userId,
        clientCreatedAt: now.toISOString(),
        status: 'LOCAL_PENDING',
        attempts: 0,
        payload: {
          shiftId: shift.id,
          saleId: sale.id,
          method: sale.method,
          reason
        }
      })
      return { refundId, amountPesos: sale.totalPesos }
    })

  notifyOperationQueued()
  return result
}
