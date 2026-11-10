import type { CajaDb } from '../../../infrastructure/database/schema'

export interface ShiftClosing {
  shiftId: string
  operationalDate: string
  openedAt: string
  closedAt: string | null
  openedBy: string
  closedBy: string | null
  openingCashPesos: number
  salesByMethod: Record<'CASH' | 'CARD' | 'BREB', number>
  refundsByMethod: Record<'CASH' | 'CARD' | 'BREB', number>
  depositsPesos: number
  withdrawalsPesos: number
  cashExpensesPesos: number
  cashExpensesByCategory: Array<{ name: string; amountPesos: number }>
  expectedPesos: number
  countedPesos: number | null
  differencePesos: number | null
  closeNote: string | null
  countedBreakdown: Record<string, number>
  voidedMovements: Array<{
    type: string
    amountPesos: number
    reason: string
    voidedAt: string
    voidedBy: string
  }>
}

function methodTotals(rows: Array<{ method: string; amountPesos: number }>) {
  const total = (method: string) => rows
    .filter((row) => row.method === method)
    .reduce((sum, row) => sum + row.amountPesos, 0)
  return { CASH: total('CASH'), CARD: total('CARD'), BREB: total('BREB') }
}

export async function shiftClosing(database: CajaDb, shiftId: string): Promise<ShiftClosing> {
  const shift = await database.shifts.get(shiftId)
  if (!shift) {
    throw new Error('Turno no encontrado')
  }
  const sales = (await database.sales.toArray()).filter((sale) => sale.shiftId === shiftId)
  const saleIds = new Set(sales.map((sale) => sale.id))
  const payments = (await database.payments.toArray()).filter((payment) => saleIds.has(payment.saleId))
  const refunds = (await database.refunds.toArray()).filter((refund) => refund.shiftId === shiftId)
  const movements = await database.cashMovements.where('shiftId').equals(shiftId).toArray()
  const active = movements.filter((movement) => !movement.voidedAt)
  const voided = movements.filter((movement) => movement.voidedAt)
  const expenses = active.filter((movement) => movement.expenseCategoryName)
  const expenseGroups = new Map<string, number>()
  for (const movement of expenses) {
    expenseGroups.set(movement.expenseCategoryName!,
      (expenseGroups.get(movement.expenseCategoryName!) ?? 0) + movement.amountPesos)
  }
  const cashExpensesByCategory = [...expenseGroups.entries()]
    .map(([name, amountPesos]) => ({ name, amountPesos }))
    .sort((left, right) => right.amountPesos - left.amountPesos)

  return {
    shiftId: shift.id,
    operationalDate: shift.operationalDate,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    openedBy: shift.userId,
    closedBy: shift.closedBy ?? null,
    openingCashPesos: shift.openingCashPesos,
    salesByMethod: methodTotals(payments),
    refundsByMethod: methodTotals(refunds),
    depositsPesos: active.filter((movement) => movement.type === 'DEPOSIT')
      .reduce((sum, movement) => sum + movement.amountPesos, 0),
    withdrawalsPesos: active.filter((movement) => movement.type === 'WITHDRAWAL')
      .reduce((sum, movement) => sum + movement.amountPesos, 0),
    cashExpensesPesos: expenses.reduce((sum, movement) => sum + movement.amountPesos, 0),
    cashExpensesByCategory,
    expectedPesos: shift.expectedPesos ?? 0,
    countedPesos: shift.countedCashPesos,
    differencePesos: shift.differencePesos,
    closeNote: shift.closeNote ?? null,
    countedBreakdown: shift.countedBreakdown ?? {},
    voidedMovements: voided.map((movement) => ({
      type: movement.type,
      amountPesos: movement.amountPesos,
      reason: movement.reason,
      voidedAt: movement.voidedAt!,
      voidedBy: movement.voidedBy!
    }))
  }
}

export function exportShiftClosingCsv(closing: ShiftClosing): Blob {
  const money = (value: number | null) => value === null ? '' : value.toLocaleString('es-CO')
  const lines = [
    `Cierre de turno;${closing.shiftId}`,
    `Fecha operativa;${closing.operationalDate}`,
    `Abierto por;${closing.openedBy}`,
    `Cerrado por;${closing.closedBy ?? ''}`,
    '',
    'Apertura',
    `Fondo inicial;${money(closing.openingCashPesos)}`,
    '',
    'Ventas por medio',
    `Efectivo;${money(closing.salesByMethod.CASH)}`,
    `Tarjeta;${money(closing.salesByMethod.CARD)}`,
    `Bre-B;${money(closing.salesByMethod.BREB)}`,
    '',
    'Devoluciones por medio',
    `Efectivo;${money(closing.refundsByMethod.CASH)}`,
    `Tarjeta;${money(closing.refundsByMethod.CARD)}`,
    `Bre-B;${money(closing.refundsByMethod.BREB)}`,
    '',
    'Movimientos',
    `Ingresos;${money(closing.depositsPesos)}`,
    `Retiros;${money(closing.withdrawalsPesos)}`,
    '',
    'Gastos de caja',
    ...closing.cashExpensesByCategory.map((row) => `${row.name};${money(row.amountPesos)}`),
    '',
    'Arqueo',
    `Esperado;${money(closing.expectedPesos)}`,
    `Contado;${money(closing.countedPesos)}`,
    `Diferencia;${money(closing.differencePesos)}`,
    `Nota;${closing.closeNote ?? ''}`,
    '',
    'Denominaciones',
    ...Object.entries(closing.countedBreakdown)
      .map(([denomination, count]) => `${denomination};${count}`),
    '',
    'Anulados',
    ...closing.voidedMovements.map((row) =>
      `${row.type};${money(row.amountPesos)};${row.reason};${row.voidedAt};${row.voidedBy}`)
  ]
  return new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
}
