import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { request } from '../../infrastructure/api/client'
import AddonsPanel from './AddonsPanel'

vi.mock('../../infrastructure/api/client', () => ({
  request: vi.fn(),
  SESSION_EXPIRED_EVENT: 'caja:session-expired'
}))

afterEach(() => {
  vi.mocked(request).mockReset()
})

const ingredients = [
  { id: 'i1', name: 'Tocineta', unit: 'GRAM' as const, wastePercent: 5, active: true }
]

it('crea un adicional con precio y receta', async () => {
  vi.mocked(request).mockResolvedValue({} as never)
  const onChanged = vi.fn().mockResolvedValue(undefined)
  render(<AddonsPanel addons={[]} ingredients={ingredients} onChanged={onChanged} />)

  await userEvent.type(screen.getByLabelText(/nombre del adicional/i), 'Tocineta extra')
  await userEvent.type(screen.getByLabelText(/^precio$/i), '5000')
  await userEvent.selectOptions(screen.getByLabelText(/^ingrediente 1$/i), 'i1')
  await userEvent.type(screen.getByLabelText(/cantidad 1/i), '30')
  await userEvent.click(screen.getByRole('button', { name: /crear adicional/i }))

  expect(vi.mocked(request).mock.calls[0][0]).toBe('/api/catalog/addons')
  expect(JSON.parse(String(vi.mocked(request).mock.calls[0][1]?.body))).toMatchObject({
    name: 'Tocineta extra',
    pricePesos: 5000,
    recipe: [{ ingredientId: 'i1', quantity: 30 }]
  })
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
})

it('edita el precio y el estado de un adicional', async () => {
  vi.mocked(request).mockResolvedValue({} as never)
  const onChanged = vi.fn().mockResolvedValue(undefined)
  render(
    <AddonsPanel
      addons={[{
        id: 'a1', name: 'Tocineta', pricePesos: 5000, active: true, recipe: []
      }]}
      ingredients={ingredients}
      onChanged={onChanged}
    />
  )

  await userEvent.click(screen.getByRole('button', { name: /editar/i }))
  await userEvent.clear(screen.getByLabelText(/^precio$/i))
  await userEvent.type(screen.getByLabelText(/^precio$/i), '6000')
  await userEvent.click(screen.getByRole('button', { name: /guardar adicional/i }))

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/addons/a1',
    expect.objectContaining({ method: 'PUT' })))
})
