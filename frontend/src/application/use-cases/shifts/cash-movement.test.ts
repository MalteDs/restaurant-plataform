import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { openDb, type CajaDb } from '../../../infrastructure/database/schema'
import { expectedCash } from './close-shift'
import { editCashMovement, registerCashMovement, voidCashMovement } from './cash-movement'

const opened: CajaDb[] = []

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

const today = new Date().toISOString().slice(0, 10)

async function seed() {
  const db = openDb(`test-movement-${crypto.randomUUID()}`)
  opened.push(db)
  await db.users.put({ id: 'u1', username: 'ana', role: 'CASHIER' })
  await db.meta.put({ key: 'activeUserId', value: 'u1' })
  await db.shifts.put({
    id: 'shift-1',
    userId: 'u1',
    openingCashPesos: 50000,
    openedAt: new Date().toISOString(),
    closedAt: null,
    countedCashPesos: null,
    expectedPesos: null,
    differencePesos: null,
    operationalDate: today
  })
  return db
}

it('registra un gasto de caja y actualiza el esperado', async () => {
  const db = await seed()
  const out = await registerCashMovement(db, {
    type: 'WITHDRAWAL', amountPesos: 5000, reason: 'compra lechuga',
    isExpense: true, expenseCategoryName: 'Fruver'
  })
  expect(await expectedCash(db, 'shift-1')).toBe(45000)
  const op = await db.operations.where('type').equals('CASH_MOVEMENT').first()
  expect(op?.payload).toMatchObject({
    movementType: 'WITHDRAWAL', amountPesos: 5000, reason: 'compra lechuga',
    expenseCategoryName: 'Fruver'
  })
  expect((await db.cashMovements.get(out.movementId))?.expenseCategoryName).toBe('Fruver')
})

it('exige categoría cuando es gasto', async () => {
  const db = await seed()
  await expect(registerCashMovement(db, {
    type: 'WITHDRAWAL', amountPesos: 5000, reason: 'compra lechuga', isExpense: true
  })).rejects.toThrow(/categor/i)
})

it('edita un movimiento y deja el viejo anulado', async () => {
  const db = await seed()
  const first = await registerCashMovement(db, {
    type: 'WITHDRAWAL', amountPesos: 5000, reason: 'compra lechuga',
    isExpense: true, expenseCategoryName: 'Fruver'
  })
  const second = await editCashMovement(db, first.movementId, {
    type: 'WITHDRAWAL', amountPesos: 3000, reason: 'compra lechuga',
    isExpense: true, expenseCategoryName: 'Aseo'
  })

  expect(await expectedCash(db, 'shift-1')).toBe(47000)
  expect((await db.cashMovements.get(first.movementId))?.voidedAt).toBeTruthy()
  expect((await db.cashMovements.get(second.movementId))?.replacesMovementId)
    .toBe(first.movementId)
})

it('anula un movimiento y restaura el esperado', async () => {
  const db = await seed()
  const out = await registerCashMovement(db, {
    type: 'WITHDRAWAL', amountPesos: 5000, reason: 'compra lechuga'
  })
  await voidCashMovement(db, out.movementId)
  expect(await expectedCash(db, 'shift-1')).toBe(50000)
  const op = (await db.operations.where('type').equals('CASH_MOVEMENT').toArray())
    .find((operation) => (operation.payload as { voided?: boolean }).voided === true)
  expect(op?.payload).toMatchObject({ voided: true, replacesMovementId: out.movementId })
})

it('no permite editar ni anular un turno cerrado', async () => {
  const db = await seed()
  const out = await registerCashMovement(db, {
    type: 'WITHDRAWAL', amountPesos: 5000, reason: 'compra lechuga'
  })
  await db.shifts.update('shift-1', { closedAt: new Date().toISOString() })

  await expect(editCashMovement(db, out.movementId, {
    type: 'WITHDRAWAL', amountPesos: 3000, reason: 'compra lechuga'
  })).rejects.toThrow(/turno abierto/i)
  await expect(voidCashMovement(db, out.movementId)).rejects.toThrow(/turno abierto/i)
})
