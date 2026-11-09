import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../app/providers/AuthProvider'
import { request } from '../../infrastructure/api/client'
import ExpensesScreen from './ExpensesScreen'

vi.mock('../../infrastructure/api/client', () => ({
  request: vi.fn(),
  SESSION_EXPIRED_EVENT: 'caja:session-expired'
}))
vi.mock('../../application/use-cases/catalog/sync-catalog', () => ({
  syncCatalog: vi.fn().mockResolvedValue(1)
}))

afterEach(() => {
  vi.mocked(request).mockReset()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

it('no permite registrar gastos sin conexión', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

  render(
    <AuthProvider>
      <ExpensesScreen />
    </AuthProvider>
  )

  expect(await screen.findByText(/requiere conexión/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /guardar/i })).not.toBeInTheDocument()
})

it('exige una categoría y envía su id', async () => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  localStorage.setItem('caja.user', JSON.stringify({
    id: 'u1', username: 'ana', role: 'MANAGER', tenantId: 't', locationId: 'l'
  }))
  vi.mocked(request).mockImplementation((path: string) => {
    if (path === '/api/expenses/categories') {
      return Promise.resolve([{ id: 'c1', name: 'Domicilios', sortOrder: 1, active: true }])
    }
    if (path.startsWith('/api/expenses?')) {
      return Promise.resolve({ expenses: [], totalPesos: 0 })
    }
    return Promise.resolve({})
  })

  render(
    <AuthProvider>
      <ExpensesScreen />
    </AuthProvider>
  )

  const category = await screen.findByLabelText(/categoría/i)
  await userEvent.selectOptions(category, 'c1')
  await userEvent.type(screen.getByLabelText(/descripción/i), 'Domicilio')
  await userEvent.type(screen.getByLabelText(/monto/i), '10000')
  await userEvent.click(screen.getByRole('button', { name: /guardar/i }))

  const post = vi.mocked(request).mock.calls.find(
    ([path, init]) => path === '/api/expenses' && init?.method === 'POST'
  )
  expect(post).toBeDefined()
  expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
    expenseCategoryId: 'c1', description: 'Domicilio', amountPesos: 10000
  })
})
