import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
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
