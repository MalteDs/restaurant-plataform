import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { request } from '../../infrastructure/api/client'
import IngredientsPanel from './IngredientsPanel'

vi.mock('../../infrastructure/api/client', () => ({
  request: vi.fn(),
  SESSION_EXPIRED_EVENT: 'caja:session-expired'
}))

afterEach(() => {
  vi.mocked(request).mockReset()
})

it('crea un ingrediente en gramos con merma', async () => {
  vi.mocked(request).mockResolvedValue({} as never)
  const onChanged = vi.fn().mockResolvedValue(undefined)
  render(<IngredientsPanel ingredients={[]} onChanged={onChanged} />)

  await userEvent.type(screen.getByLabelText(/nombre del ingrediente/i), 'Tocineta')
  await userEvent.selectOptions(screen.getByLabelText(/unidad/i), 'GRAM')
  await userEvent.type(screen.getByLabelText(/merma/i), '5')
  await userEvent.click(screen.getByRole('button', { name: /crear ingrediente/i }))

  expect(JSON.parse(String(vi.mocked(request).mock.calls[0][1]?.body))).toMatchObject({
    name: 'Tocineta',
    unit: 'GRAM',
    wastePercent: 5
  })
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
})

it('edita la merma de un ingrediente', async () => {
  vi.mocked(request).mockResolvedValue({} as never)
  const onChanged = vi.fn().mockResolvedValue(undefined)
  render(
    <IngredientsPanel
      ingredients={[{ id: 'i1', name: 'Carne', unit: 'UNIT', wastePercent: 0, active: true }]}
      onChanged={onChanged}
    />
  )

  await userEvent.click(screen.getByRole('button', { name: /editar/i }))
  await userEvent.clear(screen.getByLabelText(/merma/i))
  await userEvent.type(screen.getByLabelText(/merma/i), '3')
  await userEvent.click(screen.getByRole('button', { name: /guardar ingrediente/i }))

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/ingredients/i1',
    expect.objectContaining({ method: 'PUT' })))
})
