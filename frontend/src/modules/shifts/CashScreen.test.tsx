import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import { openDb, type CajaDb } from '../../infrastructure/database/schema'
import CashScreen from './CashScreen'

const opened: CajaDb[] = []

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

it('muestra el arqueo y la diferencia al cerrar el turno', async () => {
  const db = openDb(`test-cash-${crypto.randomUUID()}`)
  opened.push(db)
  const today = new Date().toISOString().slice(0, 10)
  await db.users.put({ id: 'u1', username: 'ana', role: 'CASHIER' })
  await db.meta.put({ key: 'activeUserId', value: 'u1' })
  await db.shifts.put({
    id: 'shift-1', userId: 'u1', openingCashPesos: 50000, openedAt: new Date().toISOString(),
    closedAt: null, countedCashPesos: null, expectedPesos: null, differencePesos: null,
    operationalDate: today
  })
  await db.sales.put({
    id: 's1', displayCode: 'ALM-A-1', status: 'CHARGED', totalPesos: 16500, type: 'COUNTER',
    method: 'CASH', operationalDate: today, createdAt: new Date().toISOString(),
    shiftId: 'shift-1', userId: 'u1', deliveryFeePesos: 0
  })
  await db.payments.put({ id: 'p1', saleId: 's1', method: 'CASH', amountPesos: 16500 })

  render(<CashScreen database={db} />)
  expect(await screen.findByTestId('expected', undefined, { timeout: 5000 })).toHaveTextContent('66.500')

  await userEvent.type(screen.getByLabelText(/efectivo contado/i), '60000')
  await userEvent.click(screen.getByRole('button', { name: /cerrar turno/i }))

  expect(await screen.findByTestId('difference')).toHaveTextContent('-6.500')
})
