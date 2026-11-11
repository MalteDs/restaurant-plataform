import { useEffect, useState } from 'react'
import type { CajaDb, CashMovementRow, ShiftRow } from '../../infrastructure/database/schema'
import { db } from '../../infrastructure/database/schema'
import { availableExpenseCategories } from '../../application/use-cases/expenses/expense-categories'
import { expectedCash } from '../../application/use-cases/shifts/close-shift'
import { shiftClosing, type ShiftClosing } from '../../application/use-cases/reports/shift-closing'
import { openShift } from '../../application/use-cases/shifts/open-shift'
import {
  editCashMovement,
  registerCashMovement,
  voidCashMovement,
  type CashMovementInput
} from '../../application/use-cases/shifts/cash-movement'
import { Button, Card, Input, PageHeader } from '../../shared/ui'
import CashMovementPanel from './CashMovementPanel'
import ShiftClosePanel from './ShiftClosePanel'
import ShiftHistory from './ShiftHistory'

interface PanelState {
  movement?: CashMovementRow
}

export default function CashScreen({ database = db }: { database?: CajaDb }) {
  const [open, setOpen] = useState<ShiftRow | null>(null)
  const [current, setCurrent] = useState<ShiftRow | null>(null)
  const [expected, setExpected] = useState(0)
  const [movements, setMovements] = useState<CashMovementRow[]>([])
  const [closing, setClosing] = useState<ShiftClosing | null>(null)
  const [history, setHistory] = useState<ShiftRow[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [userNames, setUserNames] = useState(new Map<string, string>())
  const [opening, setOpening] = useState('50000')
  const [panel, setPanel] = useState<PanelState | null>(null)
  const [showVoided, setShowVoided] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function refresh() {
    const shifts = await database.shifts.toArray()
    const openShift = shifts.find((shift) => shift.closedAt === null) ?? null
    const latest = openShift
      ?? [...shifts].sort((left, right) => right.openedAt.localeCompare(left.openedAt))[0]
      ?? null
    const expectedPesos = openShift
      ? await expectedCash(database, openShift.id)
      : latest?.expectedPesos ?? 0
    const rows = latest
      ? await database.cashMovements.where('shiftId').equals(latest.id).toArray()
      : []
    const summary = latest ? await shiftClosing(database, latest.id) : null
    const available = await availableExpenseCategories(database)
    const users = await database.users.toArray()
    setOpen(openShift)
    setCurrent(latest)
    setExpected(expectedPesos)
    setMovements(rows)
    setClosing(summary)
    setHistory(shifts
      .filter((shift) => shift.closedAt !== null)
      .sort((left, right) => right.openedAt.localeCompare(left.openedAt)))
    setCategories(available)
    setUserNames(new Map(users.map((user) => [user.id, user.username])))
  }

  useEffect(() => {
    void refresh()
  }, [database])

  async function onOpen() {
    setError('')
    setNotice('')
    try {
      await openShift(database, Number(opening) || 0)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo abrir el turno')
    }
  }

  async function onSave(input: CashMovementInput) {
    const editing = panel?.movement
    if (editing) {
      await editCashMovement(database, editing.id, input)
    } else {
      await registerCashMovement(database, input)
    }
    setPanel(null)
    setNotice(editing ? 'Movimiento actualizado' : 'Movimiento guardado')
    await refresh()
  }

  async function onVoid(movement: CashMovementRow) {
    if (!window.confirm('¿Anular este movimiento? Quedará registrado en el historial.')) {
      return
    }
    setError('')
    try {
      await voidCashMovement(database, movement.id)
      setNotice('Movimiento anulado')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo anular el movimiento')
    }
  }

  async function onClosed() {
    setNotice('Turno cerrado')
    await refresh()
  }

  const active = movements.filter((movement) => !movement.voidedAt)
  const voided = movements.filter((movement) => movement.voidedAt)
  const deposits = active.filter((movement) => movement.type === 'DEPOSIT')
    .reduce((sum, movement) => sum + movement.amountPesos, 0)
  const withdrawals = active.filter((movement) => movement.type === 'WITHDRAWAL')
    .reduce((sum, movement) => sum + movement.amountPesos, 0)
  const expenses = active.filter((movement) => movement.expenseCategoryName)
    .reduce((sum, movement) => sum + movement.amountPesos, 0)

  function movementRow(movement: CashMovementRow, canEdit: boolean) {
    const isExpense = Boolean(movement.expenseCategoryName)
    const badge = movement.type === 'DEPOSIT'
      ? { label: 'Ingreso', className: 'bg-emerald-50 text-emerald-700' }
      : isExpense
        ? { label: 'Gasto', className: 'bg-red-50 text-red-700' }
        : { label: 'Retiro', className: 'bg-amber-50 text-amber-700' }
    const user = movement.userId ? userNames.get(movement.userId) ?? movement.userId : ''
    const meta = [movement.expenseCategoryName, user].filter(Boolean).join(' · ')

    return (
      <li key={movement.id}
        className="flex flex-wrap items-center gap-3 border-t border-gray-100 py-3 text-sm">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-gray-900">{movement.reason}</p>
          {meta ? <p className="truncate text-xs text-gray-500">{meta}</p> : null}
        </div>
        <span className="font-semibold text-gray-900">
          ${movement.amountPesos.toLocaleString('es-CO')}
        </span>
        {canEdit && open ? (
          <div className="flex gap-1">
            <Button variant="ghost" className="px-2 py-1 text-xs"
              onClick={() => {
                setNotice('')
                setPanel({ movement })
              }}>
              Editar
            </Button>
            <Button variant="ghost" className="px-2 py-1 text-xs !text-red-600"
              onClick={() => void onVoid(movement)}>
              Anular
            </Button>
          </div>
        ) : null}
      </li>
    )
  }

  const openForm = (
    <Card>
      <h2 className="text-sm font-semibold text-gray-900">Abrir turno</h2>
      <p className="mt-1 text-sm text-gray-500">Registra el fondo inicial en efectivo.</p>
      <label className="mt-3 block text-sm font-medium text-gray-700">
        Fondo inicial
        <Input className="mt-1" type="number" inputMode="numeric" min={0} value={opening}
          onChange={(event) => setOpening(event.target.value)} />
      </label>
      <Button className="mt-3" onClick={onOpen}>Abrir turno</Button>
    </Card>
  )

  return (
    <div className="space-y-4">
      <PageHeader title="Caja" subtitle="Turno, movimientos y cierre" />
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}

      {current ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-gray-500">
                  {open ? 'Turno abierto' : 'Turno cerrado'}
                </p>
                <p className="mt-1 text-3xl font-bold text-gray-900">
                  <span data-testid="expected">${expected.toLocaleString('es-CO')}</span>
                </p>
                <p className="text-xs text-gray-500">Efectivo esperado</p>
              </div>
              {open ? (
                <Button onClick={() => {
                  setNotice('')
                  setPanel({})
                }}>
                  Registrar movimiento
                </Button>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-3 text-center text-sm">
              <div>
                <p className="text-gray-500">Ingresos</p>
                <p className="font-semibold text-gray-900">${deposits.toLocaleString('es-CO')}</p>
              </div>
              <div>
                <p className="text-gray-500">Retiros</p>
                <p className="font-semibold text-gray-900">${withdrawals.toLocaleString('es-CO')}</p>
              </div>
              <div>
                <p className="text-gray-500">Gastos</p>
                <p className="font-semibold text-gray-900">${expenses.toLocaleString('es-CO')}</p>
              </div>
            </div>

            {open && panel ? (
              <CashMovementPanel
                movement={panel.movement}
                categories={categories}
                onSave={onSave}
                onCancel={() => setPanel(null)}
              />
            ) : null}

            <div className="mt-5 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Movimientos del turno</h3>
              {voided.length > 0 ? (
                <Button variant="ghost" className="px-2 py-1 text-xs"
                  onClick={() => setShowVoided(!showVoided)}>
                  {showVoided ? 'Ocultar anulados' : `Ver anulados (${voided.length})`}
                </Button>
              ) : null}
            </div>
            {active.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Sin movimientos.</p>
            ) : (
              <ul className="mt-2">{active.map((movement) => movementRow(movement, true))}</ul>
            )}
            {showVoided && voided.length > 0 ? (
              <ul className="mt-2">{voided.map((movement) => movementRow(movement, false))}</ul>
            ) : null}

            {!open ? (
              <div className="mt-4 border-t border-gray-200 pt-3 text-sm">
                <p>
                  Contado: ${(current.countedCashPesos ?? 0).toLocaleString('es-CO')}
                  {' · '}Diferencia:{' '}
                  <span data-testid="difference" className="font-semibold text-gray-900">
                    ${(current.differencePesos ?? 0).toLocaleString('es-CO')}
                  </span>
                </p>
              </div>
            ) : null}
          </Card>

          <div>
            {open ? (
              <ShiftClosePanel database={database} expectedPesos={expected}
                summary={closing} onClosed={onClosed} />
            ) : (
              openForm
            )}
          </div>
        </div>
      ) : (
        openForm
      )}

      {current ? <ShiftHistory database={database} shifts={history} /> : null}
    </div>
  )
}
