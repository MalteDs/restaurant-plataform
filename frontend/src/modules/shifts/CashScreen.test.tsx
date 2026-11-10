import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { openDb, type CajaDb } from '../../infrastructure/database/schema'
import CashScreen from './CashScreen'

const opened: CajaDb[] = []
const today = new Date().toISOString().slice(0, 10)

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
  vi.restoreAllMocks()
})

async function seedWithShift({ closed = false } = {}) {
  const db = openDb(`test-cash-${crypto.randomUUID()}`)
  opened.push(db)
  await db.users.put({ id: 'u1', username: 'ana', role: 'CASHIER' })
  await db.meta.put({ key: 'activeUserId', value: 'u1' })
  await db.shifts.put({
    id: 'shift-1',
    userId: 'u1',
    openingCashPesos: 50000,
    openedAt: new Date().toISOString(),
    closedAt: closed ? new Date().toISOString() : null,
    countedCashPesos: closed ? 43000 : null,
    expectedPesos: closed ? 50000 : null,
    differencePesos: closed ? -7000 : null,
    operationalDate: today,
    countedBreakdown: closed ? { '20000': 2, '1000': 3 } : null,
    closeNote: closed ? 'faltante revisado' : null,
    closedBy: closed ? 'u1' : null
  })
  return db
}

it('registra un gasto de caja y actualiza el esperado', async () => {
  const db = await seedWithShift()
  render(<CashScreen database={db} />)

  await userEvent.click(await screen.findByRole('button', { name: /registrar gasto de caja/i }))
  await userEvent.type(screen.getByLabelText(/monto/i), '5000')
  await userEvent.type(screen.getByLabelText(/motivo/i), 'compra lechuga')
  await userEvent.selectOptions(screen.getByLabelText(/categoría/i), 'Fruver')
  await userEvent.click(screen.getByRole('button', { name: /guardar movimiento/i }))

  await waitFor(() => expect(screen.getByTestId('expected')).toHaveTextContent('45.000'))
  expect(screen.getByText(/compra lechuga/i)).toBeInTheDocument()
  expect(screen.getByText(/Fruver/i)).toBeInTheDocument()
})

it('edita y anula movimientos con el turno abierto', async () => {
  const db = await seedWithShift()
  await db.cashMovements.put({
    id: 'm1', shiftId: 'shift-1', type: 'WITHDRAWAL', amountPesos: 5000,
    reason: 'compra lechuga', operationalDate: today, expenseCategoryName: 'Fruver'
  })
  render(<CashScreen database={db} />)

  await userEvent.click(await screen.findByRole('button', { name: /editar/i }))
  await userEvent.clear(screen.getByLabelText(/monto/i))
  await userEvent.type(screen.getByLabelText(/monto/i), '3000')
  await userEvent.selectOptions(screen.getByLabelText(/categoría/i), 'Aseo')
  await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

  await waitFor(() => expect(screen.getByTestId('expected')).toHaveTextContent('47.000'))

  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await userEvent.click(screen.getByRole('button', { name: /anular/i }))
  await waitFor(() => expect(screen.getByTestId('expected')).toHaveTextContent('50.000'))
})

it('oculta editar y anular después de cerrar', async () => {
  const db = await seedWithShift({ closed: true })
  await db.cashMovements.put({
    id: 'm1', shiftId: 'shift-1', type: 'WITHDRAWAL', amountPesos: 5000,
    reason: 'compra lechuga', operationalDate: today
  })
  render(<CashScreen database={db} />)

  expect(await screen.findByText(/compra lechuga/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /anular/i })).not.toBeInTheDocument()
})

it('un cajero puede usar Caja', async () => {
  const db = await seedWithShift()
  localStorage.setItem('caja.user', JSON.stringify({
    id: 'u1', username: 'ana', role: 'CASHIER', tenantId: 't', locationId: 'l'
  }))
  render(<CashScreen database={db} />)

  expect(await screen.findByRole('button', { name: /registrar retiro/i })).toBeInTheDocument()
})

it('cierra con denominaciones y exige nota si hay diferencia', async () => {
  const db = await seedWithShift()
  render(<CashScreen database={db} />)

  await userEvent.type(await screen.findByLabelText(/cantidad de 20\.000/i), '2')
  await userEvent.type(screen.getByLabelText(/cantidad de 1\.000/i), '3')
  expect(screen.getByTestId('counted')).toHaveTextContent('43.000')
  await userEvent.click(screen.getByRole('button', { name: /cerrar turno/i }))
  expect(await screen.findByText(/nota es obligatoria/i)).toBeInTheDocument()

  await userEvent.type(screen.getByLabelText(/nota del cierre/i), 'faltante revisado')
  await userEvent.click(screen.getByRole('button', { name: /cerrar turno/i }))
  await waitFor(() => expect(screen.getByTestId('difference')).toHaveTextContent('-7.000'))
})

it('muestra el turno cerrado en el historial y permite descargar', async () => {
  const db = await seedWithShift({ closed: true })
  render(<CashScreen database={db} />)

  expect(await screen.findByText(/turnos anteriores/i)).toBeInTheDocument()
  expect(screen.getByText(/faltante revisado/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /descargar cierre/i })).toBeInTheDocument()
})
