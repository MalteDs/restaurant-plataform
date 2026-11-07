import { notifyOperationQueued } from '../../../infrastructure/synchronization/notify'
import type { CajaDb } from '../../../infrastructure/database/schema'
import { activeUserId } from '../../../modules/auth/session'

export interface OpenShiftResult {
  shiftId: string
  openingCashPesos: number
}

function localDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now)
}

export async function openShift(
  database: CajaDb,
  openingCashPesos: number,
  deps: { now?: Date; userId?: string } = {}
): Promise<OpenShiftResult> {
  const open = (await database.shifts.toArray()).find((shift) => shift.closedAt === null)
  if (open) {
    throw new Error('Ya hay un turno abierto')
  }
  const userId = deps.userId ?? (await activeUserId(database))
  if (!userId) {
    throw new Error('No hay usuario activo')
  }
  const now = deps.now ?? new Date()
  const shiftId = crypto.randomUUID()

  await database.transaction('rw', [database.shifts, database.operations, database.meta], async () => {
    const sequenceRow = await database.meta.get('operationSeq')
    const seq = (typeof sequenceRow?.value === 'number' ? sequenceRow.value : 0) + 1
    await database.meta.put({ key: 'operationSeq', value: seq })
    await database.shifts.put({
      id: shiftId,
      userId,
      openingCashPesos,
      openedAt: now.toISOString(),
      closedAt: null,
      countedCashPesos: null,
      expectedPesos: null,
      differencePesos: null,
      operationalDate: localDate(now)
    })
    await database.operations.add({
      operationId: crypto.randomUUID(),
      seq,
      type: 'OPEN_SHIFT',
      entityId: shiftId,
      userId,
      clientCreatedAt: now.toISOString(),
      status: 'LOCAL_PENDING',
      attempts: 0,
      payload: { openingCashPesos, shiftId }
    })
  })

  notifyOperationQueued()
  return { shiftId, openingCashPesos }
}
