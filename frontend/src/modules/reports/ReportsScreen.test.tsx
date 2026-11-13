import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { request } from '../../infrastructure/api/client'
import { db } from '../../infrastructure/database/schema'
import { bogotaDate } from '../../shared/dates'
import ReportsScreen from './ReportsScreen'

vi.mock('../../infrastructure/api/client', () => ({ request: vi.fn() }))
vi.mock('../expenses/ExpensesScreen', () => ({ default: () => null }))

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  db.close()
  await db.delete()
})

it('muestra el consumo de ingredientes y advierte cobertura baja', async () => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  vi.mocked(request).mockResolvedValue({
    expensesPesos: 0,
    byIngredient: [{ name: 'Carne', unit: 'UNIT', quantity: 42, wastePercent: 5 }],
    recipeCoveragePercent: 62.5
  } as never)

  render(<ReportsScreen />)

  expect(await screen.findByText(/consumo de ingredientes/i)).toBeInTheDocument()
  expect(screen.getByText(/42 unidad/i)).toBeInTheDocument()
  expect(screen.getByText(/62[,.]5 %/i)).toBeInTheDocument()
  expect(screen.getByText(/reporte es incompleto/i)).toBeInTheDocument()
})

it('advierte cobertura cero aunque no haya ingredientes', async () => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  vi.mocked(request).mockResolvedValue({
    expensesPesos: 0,
    byIngredient: [],
    recipeCoveragePercent: 0
  } as never)

  render(<ReportsScreen />)

  expect(await screen.findByText(/cobertura de recetas: 0 %/i)).toBeInTheDocument()
  expect(screen.getByText(/reporte es incompleto/i)).toBeInTheDocument()
})

it('muestra todas las ventas locales aunque el servidor aún tenga solo una', async () => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  const today = bogotaDate()
  await db.sales.bulkPut([
    {
      id: 's1',
      displayCode: 'ALM-A-1',
      status: 'CHARGED',
      totalPesos: 16500,
      type: 'COUNTER',
      method: 'CASH',
      operationalDate: today,
      createdAt: `${today}T15:00:00.000Z`,
      shiftId: 'shift-1',
      userId: 'u1',
      deliveryFeePesos: 0
    },
    {
      id: 's2',
      displayCode: 'ALM-A-2',
      status: 'CHARGED',
      totalPesos: 35000,
      type: 'COUNTER',
      method: 'CASH',
      operationalDate: today,
      createdAt: `${today}T16:00:00.000Z`,
      shiftId: 'shift-1',
      userId: 'u1',
      deliveryFeePesos: 0
    }
  ])
  vi.mocked(request).mockResolvedValue({ expensesPesos: 5000 } as never)

  render(<ReportsScreen />)

  const totalCard = (await screen.findByText('Ventas')).closest('div')!
  expect(totalCard).toHaveTextContent('$51.500')
  expect(totalCard).not.toHaveTextContent('$16.500')
})
