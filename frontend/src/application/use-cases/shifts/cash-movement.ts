import { notifyOperationQueued } from '../../../infrastructure/synchronization/notify'
import type { CajaDb } from '../../../infrastructure/database/schema'
import { activeUserId } from '../../../modules/auth/session'

export interface CashMovementInput {
  type: 'DEPOSIT' | 'WITHDRAWAL'
  amountPesos: number
  reason: string
  isExpense?: boolean
  expenseCategoryName?: string | null
}

interface Deps {
  now?: Date
  userId?: string
}

function localDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now)
}

function validate(input: CashMovementInput) {
  if (!Number.isInteger(input.amountPesos) || input.amountPesos <= 0) {
    throw new Error('El monto debe ser un entero mayor que cero')
  }
  const reason = input.reason.trim()
  if (reason.length < 5 || reason.length > 200) {
    throw new Error('El motivo debe tener entre 5 y 200 caracteres')
  }
  if (input.isExpense && input.type !== 'WITHDRAWAL') {
    throw new Error('Solo un retiro puede ser gasto')
  }
  const category = input.isExpense ? (input.expenseCategoryName ?? '').trim() : null
  if (input.isExpense && !category) {
    throw new Error('La categoría es obligatoria para un gasto')
  }
  return { amountPesos: input.amountPesos, reason, category }
}

async function nextSeq(database: CajaDb): Promise<number> {
  const row = await database.meta.get('operationSeq')
  const seq = (typeof row?.value === 'number' ? row.value : 0) + 1
  await database.meta.put({ key: 'operationSeq', value: seq })
  return seq
}

async function openShift(database: CajaDb) {
  const shift = (await database.shifts.toArray()).find((row) => row.closedAt === null)
  if (!shift) {
    throw new Error('No hay turno abierto')
  }
  return shift
}

async function userId(database: CajaDb, deps: Deps): Promise<string> {
  const id = deps.userId ?? (await activeUserId(database))
  if (!id) {
    throw new Error('No hay usuario activo')
  }
  return id
}

export async function registerCashMovement(
  database: CajaDb,
  input: CashMovementInput,
  deps: Deps = {}
): Promise<{ movementId: string }> {
  const { amountPesos, reason, category } = validate(input)
  const user = await userId(database, deps)
  const now = deps.now ?? new Date()
  const movementId = crypto.randomUUID()

  await database.transaction(
    'rw',
    [database.shifts, database.cashMovements, database.operations, database.meta],
    async () => {
      const shift = await openShift(database)
      const seq = await nextSeq(database)
      await database.cashMovements.put({
        id: movementId,
        shiftId: shift.id,
        type: input.type,
        amountPesos,
        reason,
        operationalDate: localDate(now),
        expenseCategoryName: category
      })
      await database.operations.add({
        operationId: crypto.randomUUID(),
        seq,
        type: 'CASH_MOVEMENT',
        entityId: movementId,
        userId: user,
        clientCreatedAt: now.toISOString(),
        status: 'LOCAL_PENDING',
        attempts: 0,
        payload: {
          shiftId: shift.id,
          movementType: input.type,
          amountPesos,
          reason,
          ...(category ? { expenseCategoryName: category } : {})
        }
      })
    }
  )

  notifyOperationQueued()
  return { movementId }
}

export async function editCashMovement(
  database: CajaDb,
  movementId: string,
  input: CashMovementInput,
  deps: Deps = {}
): Promise<{ movementId: string }> {
  const { amountPesos, reason, category } = validate(input)
  const user = await userId(database, deps)
  const now = deps.now ?? new Date()
  const newId = crypto.randomUUID()

  await database.transaction(
    'rw',
    [database.shifts, database.cashMovements, database.operations, database.meta],
    async () => {
      const shift = await openShift(database)
      const old = await database.cashMovements.get(movementId)
      if (!old || old.shiftId !== shift.id || old.voidedAt) {
        throw new Error('El movimiento no existe o no está activo')
      }
      const seq = await nextSeq(database)
      await database.cashMovements.update(old.id, {
        voidedAt: now.toISOString(),
        voidedBy: user
      })
      await database.cashMovements.put({
        id: newId,
        shiftId: shift.id,
        type: input.type,
        amountPesos,
        reason,
        operationalDate: localDate(now),
        expenseCategoryName: category,
        replacesMovementId: old.id
      })
      await database.operations.add({
        operationId: crypto.randomUUID(),
        seq,
        type: 'CASH_MOVEMENT',
        entityId: newId,
        userId: user,
        clientCreatedAt: now.toISOString(),
        status: 'LOCAL_PENDING',
        attempts: 0,
        payload: {
          shiftId: shift.id,
          movementType: input.type,
          amountPesos,
          reason,
          ...(category ? { expenseCategoryName: category } : {}),
          replacesMovementId: old.id
        }
      })
    }
  )

  notifyOperationQueued()
  return { movementId: newId }
}

export async function voidCashMovement(
  database: CajaDb,
  movementId: string,
  deps: Deps = {}
): Promise<void> {
  const user = await userId(database, deps)
  const now = deps.now ?? new Date()

  await database.transaction(
    'rw',
    [database.shifts, database.cashMovements, database.operations, database.meta],
    async () => {
      const shift = await openShift(database)
      const old = await database.cashMovements.get(movementId)
      if (!old || old.shiftId !== shift.id || old.voidedAt) {
        throw new Error('El movimiento no existe o no está activo')
      }
      const seq = await nextSeq(database)
      await database.cashMovements.update(old.id, {
        voidedAt: now.toISOString(),
        voidedBy: user
      })
      await database.operations.add({
        operationId: crypto.randomUUID(),
        seq,
        type: 'CASH_MOVEMENT',
        entityId: old.id,
        userId: user,
        clientCreatedAt: now.toISOString(),
        status: 'LOCAL_PENDING',
        attempts: 0,
        payload: {
          shiftId: shift.id,
          replacesMovementId: old.id,
          voided: true
        }
      })
    }
  )

  notifyOperationQueued()
}
