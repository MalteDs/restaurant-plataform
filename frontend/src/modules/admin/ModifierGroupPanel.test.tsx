import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { request } from '../../infrastructure/api/client'
import ModifierGroupPanel from './ModifierGroupPanel'

vi.mock('../../infrastructure/api/client', () => ({
  request: vi.fn(),
  SESSION_EXPIRED_EVENT: 'caja:session-expired'
}))

afterEach(() => {
  vi.mocked(request).mockReset()
})

it('crea un grupo con opciones y precios adicionales', async () => {
  vi.mocked(request).mockResolvedValue({} as never)
  const onChanged = vi.fn().mockResolvedValue(undefined)
  render(<ModifierGroupPanel groups={[]} onChanged={onChanged} />)

  await userEvent.type(screen.getByLabelText(/nombre del grupo/i), 'EXTRAS')
  await userEvent.type(screen.getByLabelText(/^opción 1$/i), 'Queso')
  await userEvent.type(screen.getByLabelText(/^precio adicional 1$/i), '2000')
  await userEvent.click(screen.getByRole('button', { name: /crear grupo/i }))

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/modifier-groups',
    expect.objectContaining({ method: 'POST' })))
  const body = JSON.parse(String(vi.mocked(request).mock.calls[0][1]?.body))
  expect(body).toMatchObject({
    name: 'EXTRAS',
    minSelection: 0,
    maxSelection: 1,
    modifiers: [{ name: 'Queso', additionalPricePesos: 2000 }]
  })
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
})

it('edita el nombre y el activo de un grupo', async () => {
  vi.mocked(request).mockResolvedValue({} as never)
  const onChanged = vi.fn().mockResolvedValue(undefined)
  render(
    <ModifierGroupPanel
      groups={[{
        id: 'g1',
        name: 'EXTRAS',
        minSelection: 0,
        maxSelection: 1,
        active: true,
        modifiers: [{ id: 'm1', name: 'Queso', additionalPricePesos: 2000 }]
      }]}
      onChanged={onChanged}
    />
  )

  await userEvent.click(screen.getByRole('button', { name: /editar/i }))
  await userEvent.clear(screen.getByLabelText(/nombre del grupo/i))
  await userEvent.type(screen.getByLabelText(/nombre del grupo/i), 'ADICIONALES')
  await userEvent.click(screen.getByRole('button', { name: /guardar grupo/i }))

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/modifier-groups/g1',
    expect.objectContaining({ method: 'PUT' })))
  const call = vi.mocked(request).mock.calls[0]
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({ name: 'ADICIONALES', active: true })
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
})
