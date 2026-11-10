import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { db } from '../../infrastructure/database/schema'
import RefundScreen from './RefundScreen'

afterEach(async () => {
  db.close()
  await db.delete()
})

it('muestra las ventas registradas', async () => {
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
      <RefundScreen />
    </MemoryRouter>
  )

  expect(await screen.findByText('ALM-A-000001')).toBeInTheDocument()
})

it('reimprime una venta desde Pedidos', async () => {
  await db.open()
  await db.sales.put({
    id: 's1', displayCode: 'ALM-A-000001', status: 'CHARGED', totalPesos: 16500,
    type: 'COUNTER', method: 'CASH', operationalDate: '2026-11-07',
    createdAt: '2026-11-07T15:00:00.000Z', shiftId: 'shift-1', userId: 'u1',
    deliveryFeePesos: 0
  })
  const print = vi.fn().mockResolvedValue(undefined)

  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RefundScreen onPrint={print} />
    </MemoryRouter>
  )

  await userEvent.click(await screen.findByRole('button', { name: /imprimir alm-a-000001/i }))
  expect(print).toHaveBeenCalledWith('s1')
})
