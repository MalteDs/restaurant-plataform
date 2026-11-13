import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { request } from '../../infrastructure/api/client'
import { openDb, type CajaDb } from '../../infrastructure/database/schema'
import { syncCatalog } from '../../application/use-cases/catalog/sync-catalog'
import CatalogScreen from './CatalogScreen'

vi.mock('../../infrastructure/api/client', () => ({
  request: vi.fn(),
  SESSION_EXPIRED_EVENT: 'caja:session-expired'
}))

vi.mock('../../application/use-cases/catalog/sync-catalog', () => ({
  syncCatalog: vi.fn().mockResolvedValue(1)
}))

const opened: CajaDb[] = []

afterEach(async () => {
  vi.mocked(request).mockReset()
  vi.mocked(syncCatalog).mockClear()
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

function category(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    name: 'HAMBURGUESAS',
    sortOrder: 1,
    active: true,
    ...overrides
  } as never
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'SENCILLA',
    categoryId: 'c1',
    categoryName: 'HAMBURGUESAS',
    kind: 'PRODUCT',
    pricePesos: 16500,
    costPesos: 0,
    sortOrder: 0,
    active: true,
    saleDays: [],
    addonIds: [],
    dayPrices: [],
    recipe: [],
    modifierGroupIds: [],
    components: [],
    ...overrides
  } as never
}

function mockAdminSnapshot(input: {
  products: unknown[]
  categories: unknown[]
  addons?: unknown[]
  ingredients?: unknown[]
  modifierGroups?: unknown[]
}) {
  vi.mocked(request).mockImplementation((path: string) => {
    if (path === '/api/catalog/admin') {
      return Promise.resolve({
        version: 1,
        products: input.products,
        categories: input.categories,
        addons: input.addons ?? [],
        ingredients: input.ingredients ?? [],
        modifierGroups: input.modifierGroups ?? []
      } as never)
    }
    return Promise.resolve({} as never)
  })
}

async function db(): Promise<CajaDb> {
  const database = openDb(`test-catalog-admin-${crypto.randomUUID()}`)
  opened.push(database)
  return database
}

it('lista activos e inactivos y busca por nombre', async () => {
  mockAdminSnapshot({
    products: [
      product({ id: 'p1', name: 'SENCILLA', active: true }),
      product({ id: 'p2', name: 'PRODUCTO VIEJO', active: false })
    ],
    categories: [category({ id: 'c1', name: 'HAMBURGUESAS' })]
  })
  const database = await db()
  render(<CatalogScreen database={database} />)

  expect(await screen.findByText('PRODUCTO VIEJO')).toBeInTheDocument()
  expect(screen.getByText('Inactivo')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText(/^buscar$/i), 'sencilla')
  await waitFor(() => expect(screen.queryByText('PRODUCTO VIEJO')).not.toBeInTheDocument())
})

it('crea un producto, refresca y sincroniza el catálogo local', async () => {
  mockAdminSnapshot({
    products: [],
    categories: [category({ id: 'c1', name: 'HAMBURGUESAS' })]
  })
  const database = await db()
  render(<CatalogScreen database={database} />)

  await userEvent.click(await screen.findByRole('button', { name: /nuevo producto/i }))
  await userEvent.type(screen.getByLabelText(/^nombre$/i), 'PRODUCTO NUEVO')
  await userEvent.selectOptions(screen.getByLabelText(/^categoría$/i), 'c1')
  await userEvent.type(screen.getByLabelText(/^precio$/i), '12300')
  await userEvent.click(screen.getByRole('button', { name: /guardar producto/i }))

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/products', expect.objectContaining({
    method: 'POST',
    body: expect.stringContaining('"name":"PRODUCTO NUEVO"')
  })))
  await waitFor(() => expect(syncCatalog).toHaveBeenCalledWith(database))
})

it('reactiva un producto inactivo', async () => {
  mockAdminSnapshot({
    products: [product({ id: 'p1', name: 'PRODUCTO VIEJO', active: false })],
    categories: [category({ id: 'c1', name: 'HAMBURGUESAS' })]
  })
  const database = await db()
  render(<CatalogScreen database={database} />)

  const products = await screen.findByRole('table')
  await userEvent.click(within(products).getByRole('button', { name: /editar/i }))
  const active = screen.getByLabelText(/^activo$/i)
  expect(active).not.toBeChecked()
  await userEvent.click(active)
  await userEvent.click(screen.getByRole('button', { name: /guardar producto/i }))

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/products/p1',
    expect.objectContaining({ method: 'PUT' })))
  const call = vi.mocked(request).mock.calls.find(
    ([path, init]) => path === '/api/catalog/products/p1' && init?.method === 'PUT'
  )
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ active: true })
})

it('guarda días, precio por día, adicionales y receta', async () => {
  mockAdminSnapshot({
    products: [],
    categories: [category({ id: 'c1', name: 'HAMBURGUESAS' })],
    addons: [{ id: 'a1', name: 'Tocineta', pricePesos: 5000, active: true, recipe: [] }],
    ingredients: [{ id: 'i1', name: 'Carne', unit: 'UNIT', wastePercent: 0, active: true }]
  })
  const database = await db()
  render(<CatalogScreen database={database} />)

  await userEvent.click(await screen.findByRole('button', { name: /nuevo producto/i }))
  await userEvent.type(screen.getByLabelText(/^nombre$/i), 'HAMBURGUESA')
  await userEvent.type(screen.getByLabelText(/^precio$/i), '20000')
  await userEvent.click(screen.getByLabelText(/^lunes$/i))
  await userEvent.type(screen.getByLabelText(/precio del lunes/i), '18000')
  await userEvent.click(screen.getByLabelText(/^tocineta/i))
  await userEvent.selectOptions(screen.getByLabelText(/^ingrediente 1$/i), 'i1')
  await userEvent.type(screen.getByLabelText(/cantidad 1/i), '120')
  await userEvent.click(screen.getByRole('button', { name: /guardar producto/i }))

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/products',
    expect.objectContaining({ method: 'POST' })))
  const call = vi.mocked(request).mock.calls.find(([path]) => path === '/api/catalog/products')
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
    saleDays: [1],
    dayPrices: [{ weekday: 1, pricePesos: 18000 }],
    addonIds: ['a1'],
    recipe: [{ ingredientId: 'i1', quantity: 120 }]
  })
})

it('crea un combo con productos y cantidades', async () => {
  mockAdminSnapshot({
    products: [product({ id: 'p1', name: 'SENCILLA', kind: 'PRODUCT' })],
    categories: [category({ id: 'c1', name: 'HAMBURGUESAS' })]
  })
  const database = await db()
  render(<CatalogScreen database={database} />)

  await userEvent.click(await screen.findByRole('button', { name: /^combos$/i }))
  await userEvent.click(await screen.findByRole('button', { name: /nuevo combo/i }))
  await userEvent.type(screen.getByLabelText(/^nombre$/i), 'COMBO PRUEBA')
  await userEvent.type(screen.getByLabelText(/^precio$/i), '25000')
  await userEvent.selectOptions(screen.getByLabelText(/producto componente/i), 'p1')
  await userEvent.clear(screen.getByLabelText(/cantidad del componente/i))
  await userEvent.type(screen.getByLabelText(/cantidad del componente/i), '2')
  await userEvent.click(screen.getByRole('button', { name: /agregar componente/i }))
  await userEvent.click(screen.getByRole('button', { name: /guardar producto/i }))

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/products',
    expect.objectContaining({ method: 'POST' })))
  const call = vi.mocked(request).mock.calls.find(([path]) => path === '/api/catalog/products')
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
    kind: 'COMBO',
    components: [{ productId: 'p1', quantity: 2 }]
  })
})

it('abre la subsección de adicionales desde el catálogo', async () => {
  mockAdminSnapshot({ products: [], categories: [] })
  const database = await db()
  render(<CatalogScreen database={database} />)

  await userEvent.click(await screen.findByRole('button', { name: /^adicionales$/i }))
  expect(screen.getByLabelText(/nombre del adicional/i)).toBeInTheDocument()
})

it('abre la subsección de ingredientes desde el catálogo', async () => {
  mockAdminSnapshot({ products: [], categories: [] })
  const database = await db()
  render(<CatalogScreen database={database} />)

  await userEvent.click(await screen.findByRole('button', { name: /^ingredientes$/i }))
  expect(screen.getByLabelText(/nombre del ingrediente/i)).toBeInTheDocument()
})

it('avisa si no puede sincronizar la caja local después de guardar', async () => {
  mockAdminSnapshot({
    products: [],
    categories: [category({ id: 'c1', name: 'HAMBURGUESAS' })]
  })
  vi.mocked(syncCatalog).mockRejectedValueOnce(new Error('sin red'))
  const database = await db()
  render(<CatalogScreen database={database} />)

  await userEvent.click(await screen.findByRole('button', { name: /nuevo producto/i }))
  await userEvent.type(screen.getByLabelText(/^nombre$/i), 'PRODUCTO NUEVO')
  await userEvent.selectOptions(screen.getByLabelText(/^categoría$/i), 'c1')
  await userEvent.type(screen.getByLabelText(/^precio$/i), '12300')
  await userEvent.click(screen.getByRole('button', { name: /guardar producto/i }))

  expect(await screen.findByText(/producto guardado/i)).toBeInTheDocument()
  expect(await screen.findByText(/caja local/i)).toBeInTheDocument()
})

it('edita nombre, precio y costo de un producto', async () => {
  mockAdminSnapshot({
    products: [product({ id: 'p1', name: 'SENCILLA', pricePesos: 16500 })],
    categories: [category({ id: 'c1', name: 'HAMBURGUESAS' })]
  })
  const database = await db()
  render(<CatalogScreen database={database} />)

  const products = await screen.findByRole('table')
  await userEvent.click(within(products).getByRole('button', { name: /editar/i }))
  await userEvent.clear(screen.getByLabelText(/^nombre$/i))
  await userEvent.type(screen.getByLabelText(/^nombre$/i), 'SENCILLA ESPECIAL')
  await userEvent.clear(screen.getByLabelText(/^precio$/i))
  await userEvent.type(screen.getByLabelText(/^precio$/i), '18000')
  await userEvent.clear(screen.getByLabelText(/costo/i))
  await userEvent.type(screen.getByLabelText(/costo/i), '6000')
  await userEvent.click(screen.getByRole('button', { name: /guardar producto/i }))

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/products/p1',
    expect.objectContaining({ method: 'PUT' })))
  const call = vi.mocked(request).mock.calls.find(
    ([path, init]) => path === '/api/catalog/products/p1' && init?.method === 'PUT'
  )
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
    name: 'SENCILLA ESPECIAL',
    pricePesos: 18000,
    costPesos: 6000
  })
})
