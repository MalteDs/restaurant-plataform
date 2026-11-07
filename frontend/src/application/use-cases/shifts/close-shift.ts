import { notifyOperationQueued } from '../../../infrastructure/synchronization/notify'
import type { CajaDb } from '../../../infrastructure/database/schema'
import { activeUserId } from '../../../modules/auth/session'

export interface CloseShiftInput {
  countedCashPesos: number
}

export interface CloseShiftResult {
  shiftId: string
  expectedPesos: number
  differencePesos: number
}

export async function expectedCash(database: CajaDb, shiftId: string): Promise<number> {
  const shift = await database.shifts.get(shiftId)
  if (!shift) {
    throw new Error('Turno no encontrado')
  }
  const sales = (await database.sales.toArray()).filter((sale) => sale.shiftId === shiftId)
  const saleIds = new Set(sales.map((sale) => sale.id))
  const payments = (await database.payments.toArray()).filter((payment) => saleIds.has(payment.saleId))
  const cashSales = payments
    .filter((payment) => payment.method === 'CASH')
    .reduce((sum, payment) => sum + payment.amountPesos, 0)
  const cashRefunds = (await database.refunds.toArray())
    .filter((refund) => refund.shiftId === shiftId && refund.method === 'CASH')
    .reduce((sum, refund) => sum + refund.amountPesos, 0)
  const movements = await database.cashMovements.where('shiftId').equals(shiftId).toArray()
  const deposits = movements.filter((m) => m.type === 'DEPOSIT')
    .reduce((sum, movement) => sum + movement.amountPesos, 0)
  const withdrawals = movements.filter((m) => m.type === 'WITHDRAWAL')
    .reduce((sum, movement) => sum + movement.amountPesos, 0)

  return shift.openingCashPesos + cashSales - cashRefunds + deposits - withdrawals
}

export async function closeShift(
  database: CajaDb,
  input: CloseShiftInput,
  deps: { now?: Date; userId?: string } = {}
): Promise<CloseShiftResult> {
  const shift = (await database.shifts.toArray()).find((row) => row.closedAt === null)
  if (!shift) {
    throw new Error('No hay turno abierto')
  }
  const userId = deps.userId ?? (await activeUserId(database))
  if (!userId) {
    throw new Error('No hay usuario activo')
  }
  const now = deps.now ?? new Date()
  const expectedPesos = await expectedCash(database, shift.id)
  const differencePesos = input.countedCashPesos - expectedPesos

  await database.transaction('rw', [database.shifts, database.operations, database.meta], async () => {
    const sequenceRow = await database.meta.get('operationSeq')
    const seq = (typeof sequenceRow?.value === 'number' ? sequenceRow.value : 0) + 1
    await database.meta.put({ key: 'operationSeq', value: seq })

    await database.shifts.update(shift.id, {
      closedAt: now.toISOString(),
      countedCashPesos: input.countedCashPesos,
      expectedPesos,
      differencePesos
    })
    await database.operations.add({
      operationId: crypto.randomUUID(),
      seq,
      type: 'CLOSE_SHIFT',
      entityId: shift.id,
      userId,
      clientCreatedAt: now.toISOString(),
      status: 'LOCAL_PENDING',
      attempts: 0,
      payload: {
        shiftId: shift.id,
        countedCashPesos: input.countedCashPesos,
        expectedPesos,
        differencePesos
      }
    })
  })

  notifyOperationQueued()
  return { shiftId: shift.id, expectedPesos, differencePesos }
}
