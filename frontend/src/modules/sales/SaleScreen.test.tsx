import 'fake-indexeddb/auto'
import type { ComponentProps } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../app/providers/AuthProvider'
import { openDb, type CajaDb } from '../../infrastructure/database/schema'
import { bogotaWeekday } from '../../shared/dates'
import SaleScreen from './SaleScreen'

const opened: CajaDb[] = []

function renderScreen(props: ComponentProps<typeof SaleScreen>) {
  return render(<AuthProvider><SaleScreen {...props} /></AuthProvider>)
}

afterEach(async () => {
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

it('un doble clic crea una sola venta', async () => {
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  await db.products.put({
    id: 'p1',
    name: 'SENCILLA',
    categoryName: 'HAMBURGUESAS',
    kind: 'PRODUCT',
    pricePesos: 16500,
    costPesos: null,
    sortOrder: 1,
    active: true,
    modifierGroupIds: [],
    components: []
  })
  const create = vi.fn().mockResolvedValue({
    saleId: 's1',
    displayCode: 'ALM-A-000001',
    totalPesos: 16500
  })

  renderScreen({ database: db, onCreateSale: create })
  await userEvent.click(await screen.findByRole('button', { name: /sencilla/i }, { timeout: 5000 }))
  await userEvent.dblClick(screen.getByRole('button', { name: /cobrar/i }))

  expect(create).toHaveBeenCalledTimes(1)
})

it('agrupa variantes y pide el tamaño antes de agregar', async () => {
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  await db.products.bulkPut([
    {
      id: 'p1',
      name: 'SALCHI TOCI - MAIZ PERSONAL',
      categoryName: 'SALCHIPAPAS',
      kind: 'PRODUCT',
      pricePesos: 18000,
      costPesos: null,
      sortOrder: 1,
      active: true,
      modifierGroupIds: [],
      components: []
    },
    {
      id: 'p2',
      name: 'SALCHI TOCI - MAIZ MEDIANA 2P',
      categoryName: 'SALCHIPAPAS',
      kind: 'PRODUCT',
      pricePesos: 24000,
      costPesos: null,
      sortOrder: 1,
      active: true,
      modifierGroupIds: [],
      components: []
    }
  ])
  const create = vi.fn().mockResolvedValue({
    saleId: 's1',
    displayCode: 'ALM-A-000002',
    totalPesos: 24000
  })

  renderScreen({ database: db, onCreateSale: create })
  const family = await screen.findByRole('button', { name: /salchi toci - maiz/i })
  expect(family).toHaveTextContent(/desde \$18\.000/i)
  expect(screen.queryByRole('button', { name: /personal/i })).not.toBeInTheDocument()

  await userEvent.click(family)
  await userEvent.click(await screen.findByRole('button', { name: /mediana 2p/i }))
  expect(screen.getByText('SALCHI TOCI - MAIZ MEDIANA 2P')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /cobrar/i }))
  expect(create).toHaveBeenCalledTimes(1)
  expect(create.mock.calls[0][0].items[0].productId).toBe('p2')
})

it('permite eliminar una línea del carrito', async () => {
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  await db.products.put({
    id: 'p1',
    name: 'SENCILLA',
    categoryName: 'HAMBURGUESAS',
    kind: 'PRODUCT',
    pricePesos: 16500,
    costPesos: null,
    sortOrder: 1,
    active: true,
    modifierGroupIds: [],
    components: []
  })

  renderScreen({ database: db })
  await userEvent.click(await screen.findByRole('button', { name: /sencilla/i }))

  const cart = screen.getByRole('region', { name: 'Carrito' })
  expect(within(cart).getByText('SENCILLA')).toBeInTheDocument()

  await userEvent.click(within(cart).getByRole('button', { name: /eliminar sencilla/i }))

  expect(within(cart).queryByText('SENCILLA')).not.toBeInTheDocument()
  expect(within(cart).getByText(/agrega productos/i)).toBeInTheDocument()
})

it('oculta productos que no se venden hoy', async () => {
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  const today = bogotaWeekday(new Date())
  const other = today === 7 ? 1 : today + 1
  await db.products.bulkPut([
    {
      id: 'hoy',
      name: 'PROMO HOY',
      categoryName: 'COMBOS',
      kind: 'COMBO',
      pricePesos: 22500,
      costPesos: null,
      sortOrder: 1,
      active: true,
      modifierGroupIds: [],
      components: [],
      saleDays: [today]
    },
    {
      id: 'otro',
      name: 'PROMO OTRO DIA',
      categoryName: 'COMBOS',
      kind: 'COMBO',
      pricePesos: 22500,
      costPesos: null,
      sortOrder: 1,
      active: true,
      modifierGroupIds: [],
      components: [],
      saleDays: [other]
    }
  ])

  renderScreen({ database: db })

  expect(await screen.findByRole('button', { name: /promo hoy/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /promo otro dia/i })).not.toBeInTheDocument()
})

it('el encargado ve el cambio de precio', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
  localStorage.setItem('caja.user', JSON.stringify({
    id: 'u1', username: 'ana', role: 'MANAGER', tenantId: 't', locationId: 'l'
  }))
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  await db.products.put({
    id: 'p1', name: 'SENCILLA', categoryName: 'HAMBURGUESAS', kind: 'PRODUCT',
    pricePesos: 16500, costPesos: null, sortOrder: 1, active: true,
    modifierGroupIds: [], components: []
  })

  renderScreen({ database: db })
  await userEvent.click(await screen.findByRole('button', { name: /sencilla/i }))

  expect(screen.getByRole('button', { name: /cambiar precio/i })).toBeInTheDocument()
})

it('el cajero no ve el cambio de precio', async () => {
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  await db.products.put({
    id: 'p1', name: 'SENCILLA', categoryName: 'HAMBURGUESAS', kind: 'PRODUCT',
    pricePesos: 16500, costPesos: null, sortOrder: 1, active: true,
    modifierGroupIds: [], components: []
  })

  renderScreen({ database: db })
  await userEvent.click(await screen.findByRole('button', { name: /sencilla/i }))

  expect(screen.queryByRole('button', { name: /cambiar precio/i })).not.toBeInTheDocument()
})

it('divide el pago entre efectivo y tarjeta', async () => {
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  await db.products.put({
    id: 'p1', name: 'PAPAS AMARILLA', categoryName: 'ENTRADAS', kind: 'PRODUCT',
    pricePesos: 7000, costPesos: null, sortOrder: 1, active: true,
    modifierGroupIds: [], components: []
  })
  const create = vi.fn().mockResolvedValue({
    saleId: 's1', displayCode: 'ALM-A-000001', totalPesos: 7000
  })

  renderScreen({ database: db, onCreateSale: create })
  await userEvent.click(await screen.findByRole('button', { name: /papas amarilla/i }))
  await userEvent.click(screen.getByRole('button', { name: /dividir pago/i }))

  const firstAmount = screen.getByLabelText(/monto del pago 1/i)
  await userEvent.clear(firstAmount)
  await userEvent.type(firstAmount, '4000')

  await userEvent.selectOptions(screen.getByLabelText(/medio del nuevo pago/i), 'CARD')
  await userEvent.type(screen.getByLabelText(/monto del nuevo pago/i), '3000')
  await userEvent.click(screen.getByRole('button', { name: /agregar pago/i }))

  expect(screen.getByText(/restante \$0/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /cobrar/i }))

  expect(create.mock.calls[0][0].payments).toEqual([
    { method: 'CASH', amountPesos: 4000 },
    { method: 'CARD', amountPesos: 3000 }
  ])
})
