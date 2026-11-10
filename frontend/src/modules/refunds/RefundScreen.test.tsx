import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { openDb, type CajaDb, type SaleRow } from '../../infrastructure/database/schema'
import { bogotaDate } from '../../shared/dates'
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

function renderScreen(db: CajaDb, onPrint?: (id: string) => Promise<void>) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RefundScreen database={db} onPrint={onPrint} />
    </MemoryRouter>
  )
}

async function seedDetail(db: CajaDb) {
  await db.users.put({ id: 'u1', username: 'ana', role: 'CASHIER' })
  await db.meta.put({ key: 'activeUserId', value: 'u1' })
  await db.shifts.put({
    id: 'shift-1', userId: 'u1', openingCashPesos: 50000, openedAt: new Date().toISOString(),
    closedAt: null, countedCashPesos: null, expectedPesos: null, differencePesos: null,
    operationalDate: bogotaDate()
  })
  await db.sales.put({
    id: 's1', displayCode: 'ALM-A-000001', status: 'CHARGED', totalPesos: 18000,
    type: 'DINE_IN', method: 'CARD', operationalDate: bogotaDate(),
    createdAt: '2026-11-10T15:00:00.000Z', shiftId: 'shift-1', userId: 'u1',
    tableLabel: 'Mesa 4', deliveryFeePesos: 0
  })
  await db.saleItems.put({
    id: 'i1', saleId: 's1', productId: 'p1', productName: 'SENCILLA',
    categoryName: 'HAMBURGUESAS', quantity: 2, unitPricePesos: 8000, costPesos: null,
    lineTotalPesos: 18000, note: 'Sin cebolla', lineNumber: 1,
    modifiers: [{ id: 'm1', name: 'Queso', additionalPricePesos: 1000 }], components: []
  })
  await db.payments.put({ id: 'pay1', saleId: 's1', method: 'CARD', amountPesos: 18000 })
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
    operationalDate: bogotaDate(),
    createdAt: '2026-11-07T15:00:00.000Z',
    shiftId: 'shift-1',
    userId: 'u1',
    deliveryFeePesos: 0
  })

  renderScreen(db)

  expect(await screen.findByText('ALM-A-000001', undefined, { timeout: 5000 })).toBeInTheDocument()
})

it('reimprime una venta desde Pedidos', async () => {
  const db = testDb()
  await db.sales.put({
    id: 's1', displayCode: 'ALM-A-000001', status: 'CHARGED', totalPesos: 16500,
    type: 'COUNTER', method: 'CASH', operationalDate: bogotaDate(),
    createdAt: '2026-11-07T15:00:00.000Z', shiftId: 'shift-1', userId: 'u1',
    deliveryFeePesos: 0
  })
  const print = vi.fn().mockResolvedValue(undefined)

  renderScreen(db, print)

  await userEvent.click(await screen.findByRole(
    'button',
    { name: /ver alm-a-000001/i },
    { timeout: 5000 }
  ))
  await userEvent.click(await screen.findByRole('button', { name: /imprimir comprobante/i }))
  expect(print).toHaveBeenCalledWith('s1')
})

it('muestra el detalle con ítems, mesa y pagos', async () => {
  const db = testDb()
  await seedDetail(db)
  renderScreen(db)

  await userEvent.click(await screen.findByRole('button', { name: /ver alm-a-000001/i }))

  expect(await screen.findByText(/SENCILLA/)).toBeInTheDocument()
  expect(screen.getAllByText(/Mesa 4/).length).toBeGreaterThan(0)
  expect(screen.getByText(/Queso/)).toBeInTheDocument()
  expect(screen.getByText(/Sin cebolla/)).toBeInTheDocument()
  expect(screen.getByText('Tarjeta')).toBeInTheDocument()
})

it('solo ofrece devolver desde el detalle', async () => {
  const db = testDb()
  await seedDetail(db)
  renderScreen(db)

  await screen.findByText('ALM-A-000001')
  expect(screen.queryByRole('button', { name: /devolver/i })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /ver alm-a-000001/i }))
  expect(await screen.findByRole('button', { name: /devolver/i })).toBeInTheDocument()
})

it('devuelve desde el detalle y muestra el motivo', async () => {
  const db = testDb()
  await seedDetail(db)
  renderScreen(db)

  await userEvent.click(await screen.findByRole('button', { name: /ver alm-a-000001/i }))
  await userEvent.click(await screen.findByRole('button', { name: /devolver/i }))
  await userEvent.type(screen.getByLabelText(/motivo/i), 'cobro equivocado')
  await userEvent.click(screen.getByRole('button', { name: /confirmar devolución/i }))

  expect(await screen.findByText(/cobro equivocado/)).toBeInTheDocument()
  expect((await screen.findAllByText(/Devuelta/)).length).toBeGreaterThan(0)
  expect((await db.sales.get('s1'))?.status).toBe('REFUNDED')
})

it('rechaza un motivo corto sin cambiar el estado de la venta', async () => {
  const db = testDb()
  await seedDetail(db)
  renderScreen(db)

  await userEvent.click(await screen.findByRole('button', { name: /ver alm-a-000001/i }))
  await userEvent.click(await screen.findByRole('button', { name: /devolver/i }))
  await userEvent.type(screen.getByLabelText(/motivo/i), 'abcd')
  await userEvent.click(screen.getByRole('button', { name: /confirmar devolución/i }))

  expect(await screen.findByText(/entre 5 y 200/)).toBeInTheDocument()
  expect((await db.sales.get('s1'))?.status).toBe('CHARGED')
})

it('usa el medio de la venta cuando no hay filas de pagos', async () => {
  const db = testDb()
  await seedDetail(db)
  await db.payments.clear()
  renderScreen(db)

  await userEvent.click(await screen.findByRole('button', { name: /ver alm-a-000001/i }))
  expect(await screen.findByText('Tarjeta')).toBeInTheDocument()
})

it('no rompe con una venta devuelta sin fila de devolución', async () => {
  const db = testDb()
  await seedDetail(db)
  await db.sales.update('s1', { status: 'REFUNDED' })
  renderScreen(db)

  await userEvent.click(await screen.findByRole('button', { name: /ver alm-a-000001/i }))
  expect((await screen.findAllByText(/Devuelta/)).length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: /devolver/i })).not.toBeInTheDocument()
})

function order(overrides: Partial<SaleRow> = {}): SaleRow {
  return {
    id: 's', displayCode: 'ALM-A-000000', status: 'CHARGED', totalPesos: 16500,
    type: 'COUNTER', method: 'CASH', operationalDate: bogotaDate(),
    createdAt: '2026-11-10T12:00:00.000Z', shiftId: 'shift-1', userId: 'u1',
    deliveryFeePesos: 0, ...overrides
  }
}

async function seedOrders(db: CajaDb) {
  for (let i = 1; i <= 51; i++) {
    await db.sales.put(order({
      id: `s${i}`,
      displayCode: `ALM-A-${String(i).padStart(6, '0')}`,
      createdAt: `2026-11-10T12:00:00.${String(i).padStart(3, '0')}Z`
    }))
  }
  await db.sales.put(order({
    id: 'old', displayCode: 'ALM-A-VIEJA', operationalDate: '2026-11-01',
    createdAt: '2026-11-01T12:00:00.000Z'
  }))
}

it('muestra solo el día actual y pagina de 50 en 50', async () => {
  const db = testDb()
  await seedOrders(db)
  renderScreen(db)

  expect(await screen.findByText(/51 pedidos/)).toBeInTheDocument()
  expect(screen.queryByText('ALM-A-VIEJA')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /cargar más/i }))
  expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument()
})

it('busca en todo el historial y muestra el estado vacío', async () => {
  const db = testDb()
  await seedOrders(db)
  renderScreen(db)

  await screen.findByText(/51 pedidos/)
  await userEvent.click(screen.getByRole('button', { name: /ver todo/i }))
  await userEvent.type(screen.getByLabelText(/buscar/i), 'vieja')

  expect(await screen.findByText('ALM-A-VIEJA')).toBeInTheDocument()
  expect(screen.getByText(/^1 pedido ·/)).toBeInTheDocument()

  await userEvent.clear(screen.getByLabelText(/buscar/i))
  await userEvent.type(screen.getByLabelText(/buscar/i), 'no-existe')
  expect(await screen.findByText('No hay pedidos para este filtro.')).toBeInTheDocument()
})

it('filtra por estado', async () => {
  const db = testDb()
  await db.sales.put(order({ id: 'ok', displayCode: 'ALM-A-OK' }))
  await db.sales.put(order({ id: 'ref', displayCode: 'ALM-A-REF', status: 'REFUNDED' }))
  renderScreen(db)

  await screen.findByText('ALM-A-OK')
  await userEvent.selectOptions(screen.getByLabelText('Estado'), 'REFUNDED')

  expect(await screen.findByText('ALM-A-REF')).toBeInTheDocument()
  expect(screen.queryByText('ALM-A-OK')).not.toBeInTheDocument()
})
