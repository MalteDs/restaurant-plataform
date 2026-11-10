import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { openDb, type CajaDb } from '../../infrastructure/database/schema'
import RefundScreen from './RefundScreen'

const opened: CajaDb[] = []

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

function testDb(): CajaDb {
  const db = openDb(`test-refund-${crypto.randomUUID()}`)
  opened.push(db)
  return db
}

it('muestra las ventas registradas', async () => {
  const db = testDb()
  await db.sales.put({
    id: 's1',
    displayCode: 'ALM-A-000001',
    status: 'CHARGED',
    totalPesos: 16500,
    type: 'COUNTER',
    method: 'CASH',
    operationalDate: '2026-11-07',
    createdAt: '2026-11-07T15:00:00.000Z',
    shiftId: 'shift-1',
    userId: 'u1',
    deliveryFeePesos: 0
  })

  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RefundScreen database={db} />
    </MemoryRouter>
  )

  expect(await screen.findByText('ALM-A-000001', undefined, { timeout: 5000 })).toBeInTheDocument()
})

it('reimprime una venta desde Pedidos', async () => {
  const db = testDb()
  await db.sales.put({
    id: 's1', displayCode: 'ALM-A-000001', status: 'CHARGED', totalPesos: 16500,
    type: 'COUNTER', method: 'CASH', operationalDate: '2026-11-07',
    createdAt: '2026-11-07T15:00:00.000Z', shiftId: 'shift-1', userId: 'u1',
    deliveryFeePesos: 0
  })
  const print = vi.fn().mockResolvedValue(undefined)

  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RefundScreen database={db} onPrint={print} />
    </MemoryRouter>
  )

  await userEvent.click(await screen.findByRole(
    'button',
    { name: /imprimir alm-a-000001/i },
    { timeout: 5000 }
  ))
  expect(print).toHaveBeenCalledWith('s1')
})
