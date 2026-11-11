import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
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
    modifierGroupIds: [],
    components: [],
    ...overrides
  } as never
}

function mockAdminSnapshot(input: {
  products: unknown[]
  categories: unknown[]
  modifierGroups?: unknown[]
}) {
  vi.mocked(request).mockImplementation((path: string) => {
    if (path === '/api/catalog/admin') {
      return Promise.resolve({
        version: 1,
        products: input.products,
        categories: input.categories,
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
  await userEvent.type(screen.getByLabelText(/buscar producto/i), 'sencilla')
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

it('edita nombre, precio y costo de un producto', async () => {
  mockAdminSnapshot({
    products: [product({ id: 'p1', name: 'SENCILLA', pricePesos: 16500 })],
    categories: [category({ id: 'c1', name: 'HAMBURGUESAS' })]
  })
  const database = await db()
  render(<CatalogScreen database={database} />)

  await userEvent.click(await screen.findByRole('button', { name: /editar/i }))
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
