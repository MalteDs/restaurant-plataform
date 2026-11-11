import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { request } from '../../infrastructure/api/client'
import CategoryPanel from './CategoryPanel'

vi.mock('../../infrastructure/api/client', () => ({
  request: vi.fn(),
  SESSION_EXPIRED_EVENT: 'caja:session-expired'
}))

afterEach(() => {
  vi.mocked(request).mockReset()
})

it('crea una categoría con nombre y orden', async () => {
  vi.mocked(request).mockResolvedValue({} as never)
  const onChanged = vi.fn().mockResolvedValue(undefined)
  render(<CategoryPanel categories={[]} onChanged={onChanged} />)

  await userEvent.type(screen.getByLabelText(/nueva categoría/i), 'POSTRES')
  await userEvent.type(screen.getByLabelText(/orden/i), '3')
  await userEvent.click(screen.getByRole('button', { name: /agregar categoría/i }))

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/categories',
    expect.objectContaining({ method: 'POST' })))
  const call = vi.mocked(request).mock.calls[0]
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({ name: 'POSTRES', sortOrder: 3 })
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
})

it('mantiene el éxito si falla la recarga posterior', async () => {
  vi.mocked(request).mockResolvedValue({} as never)
  const onChanged = vi.fn().mockRejectedValueOnce(new Error('sin red'))
  render(<CategoryPanel categories={[]} onChanged={onChanged} />)

  await userEvent.type(screen.getByLabelText(/nueva categoría/i), 'POSTRES')
  await userEvent.type(screen.getByLabelText(/orden/i), '3')
  await userEvent.click(screen.getByRole('button', { name: /agregar categoría/i }))

  expect(await screen.findByText(/^categoría agregada$/i)).toBeInTheDocument()
  expect(await screen.findByText(/no se pudo recargar/i)).toBeInTheDocument()
  expect(screen.queryByText(/no se pudo agregar la categoría/i)).not.toBeInTheDocument()
})

it('edita nombre, orden y activo de una categoría', async () => {
  vi.mocked(request).mockResolvedValue({} as never)
  const onChanged = vi.fn().mockResolvedValue(undefined)
  render(
    <CategoryPanel
      categories={[{ id: 'c1', name: 'BEBIDAS', sortOrder: 1, active: true }]}
      onChanged={onChanged}
    />
  )

  await userEvent.click(screen.getByRole('button', { name: /editar/i }))
  await userEvent.clear(screen.getByLabelText(/^nombre$/i))
  await userEvent.type(screen.getByLabelText(/^nombre$/i), 'BEBIDAS FRÍAS')
  await userEvent.click(screen.getByRole('button', { name: /guardar categoría/i }))

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/categories/c1',
    expect.objectContaining({ method: 'PUT' })))
  const call = vi.mocked(request).mock.calls[0]
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({
    name: 'BEBIDAS FRÍAS',
    sortOrder: 1,
    active: true
  })
})
