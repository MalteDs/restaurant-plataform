import { useEffect, useState } from 'react'
import type { CajaDb, CashMovementRow, ShiftRow } from '../../infrastructure/database/schema'
import { db } from '../../infrastructure/database/schema'
import { availableExpenseCategories } from '../../application/use-cases/expenses/expense-categories'
import { closeShift, expectedCash } from '../../application/use-cases/shifts/close-shift'
import { openShift } from '../../application/use-cases/shifts/open-shift'
import {
  editCashMovement,
  registerCashMovement,
  voidCashMovement,
  type CashMovementInput
} from '../../application/use-cases/shifts/cash-movement'
import { Button, Card, Input, PageHeader } from '../../shared/ui'
import CashMovementPanel from './CashMovementPanel'

interface PanelState {
  movement?: CashMovementRow
  type: 'DEPOSIT' | 'WITHDRAWAL'
  expense: boolean
}

export default function CashScreen({ database = db }: { database?: CajaDb }) {
  const [open, setOpen] = useState<ShiftRow | null>(null)
  const [current, setCurrent] = useState<ShiftRow | null>(null)
  const [expected, setExpected] = useState(0)
  const [movements, setMovements] = useState<CashMovementRow[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [userNames, setUserNames] = useState(new Map<string, string>())
  const [opening, setOpening] = useState('50000')
  const [counted, setCounted] = useState('')
  const [panel, setPanel] = useState<PanelState | null>(null)
  const [showVoided, setShowVoided] = useState(false)
  const [error, setError] = useState('')

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
    const available = await availableExpenseCategories(database)
    const users = await database.users.toArray()
    setOpen(openShift)
    setCurrent(latest)
    setExpected(expectedPesos)
    setMovements(rows)
    setCategories(available)
    setUserNames(new Map(users.map((user) => [user.id, user.username])))
  }

  useEffect(() => {
    void refresh()
  }, [database])

  async function onOpen() {
    setError('')
    try {
      await openShift(database, Number(opening) || 0)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo abrir el turno')
    }
  }

  async function onSave(input: CashMovementInput) {
    if (panel?.movement) {
      await editCashMovement(database, panel.movement.id, input)
    } else {
      await registerCashMovement(database, input)
    }
    setPanel(null)
    await refresh()
  }

  async function onVoid(movement: CashMovementRow) {
    if (!window.confirm('¿Anular este movimiento? Quedará registrado en el historial.')) {
      return
    }
    setError('')
    try {
      await voidCashMovement(database, movement.id)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo anular el movimiento')
    }
  }

  async function onClose() {
    setError('')
    try {
      await closeShift(database, { countedCashPesos: Number(counted) || 0 })
      setCounted('')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cerrar el turno')
    }
  }

  const active = movements.filter((movement) => !movement.voidedAt)
  const voided = movements.filter((movement) => movement.voidedAt)

  function movementRow(movement: CashMovementRow) {
    const category = movement.expenseCategoryName ? ` · ${movement.expenseCategoryName}` : ''
    const user = movement.userId ? userNames.get(movement.userId) ?? movement.userId : ''
    return (
      <li key={movement.id}
        className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 py-2 text-sm">
        <div>
          <p>
            <span className="font-medium">{movement.type === 'DEPOSIT' ? 'Ingreso' : 'Retiro'}</span>
            {' '}${movement.amountPesos.toLocaleString('es-CO')}
          </p>
          <p className="text-gray-500">
            {movement.reason}{category}{user ? ` · ${user}` : ''}
          </p>
        </div>
        {open ? (
          <div className="flex gap-2">
            <Button variant="ghost"
              onClick={() => setPanel({
                movement,
                type: movement.type,
                expense: Boolean(movement.expenseCategoryName)
              })}>
              Editar
            </Button>
            <Button variant="danger" onClick={() => void onVoid(movement)}>Anular</Button>
          </div>
        ) : null}
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Caja" subtitle="Turno, movimientos y cierre" />
      {current ? (
        <Card>
          <p className="text-sm text-gray-500">
            {open ? 'Turno abierto' : 'Turno cerrado'} · efectivo esperado{' '}
            <span data-testid="expected" className="font-semibold text-gray-900">
              ${expected.toLocaleString('es-CO')}
            </span>
          </p>
          {open ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => setPanel({ type: 'DEPOSIT', expense: false })}>
                Registrar ingreso
              </Button>
              <Button onClick={() => setPanel({ type: 'WITHDRAWAL', expense: false })}>
                Registrar retiro
              </Button>
              <Button onClick={() => setPanel({ type: 'WITHDRAWAL', expense: true })}>
                Registrar gasto de caja
              </Button>
            </div>
          ) : null}
          {open && panel ? (
            <CashMovementPanel
              movement={panel.movement}
              categories={categories}
              initialType={panel.type}
              initialExpense={panel.expense}
              onSave={onSave}
              onCancel={() => setPanel(null)}
            />
          ) : null}
          <h3 className="mt-5 text-sm font-semibold text-gray-900">Movimientos del turno</h3>
          {active.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Sin movimientos.</p>
          ) : (
            <ul className="mt-2">{active.map(movementRow)}</ul>
          )}
          {voided.length > 0 ? (
            <>
              <Button className="mt-2" variant="ghost" onClick={() => setShowVoided(!showVoided)}>
                Ver anulados
              </Button>
              {showVoided ? <ul className="mt-2">{voided.map(movementRow)}</ul> : null}
            </>
          ) : null}
          {open ? (
            <div className="mt-5 space-y-3 border-t border-gray-200 pt-3">
              <label className="block text-sm font-medium text-gray-700">
                Efectivo contado
                <Input className="mt-1" type="number" min={0} value={counted}
                  onChange={(event) => setCounted(event.target.value)} />
              </label>
              <Button onClick={onClose}>Cerrar turno</Button>
            </div>
          ) : null}
        </Card>
      ) : null}
      {!open ? (
        <Card>
          <p className="text-sm text-gray-500">No hay turno abierto.</p>
          <label className="mt-3 block text-sm font-medium text-gray-700">
            Fondo inicial
            <Input className="mt-1" type="number" min={0} value={opening}
              onChange={(event) => setOpening(event.target.value)} />
          </label>
          <Button className="mt-3" onClick={onOpen}>Abrir turno</Button>
        </Card>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  )
}
