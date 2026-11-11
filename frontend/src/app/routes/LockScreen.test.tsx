import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, it, vi } from 'vitest'

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }))

vi.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { username: 'ana' },
    unlock: vi.fn().mockResolvedValue(false),
    logout
  })
}))

import LockScreen from './LockScreen'

it('permite volver al login cuando la sesión no se puede desbloquear', async () => {
  render(
    <MemoryRouter initialEntries={['/lock']}>
      <Routes>
        <Route path="/lock" element={<LockScreen />} />
        <Route path="/login" element={<p>Pantalla de login</p>} />
      </Routes>
    </MemoryRouter>
  )

  await userEvent.click(screen.getByRole('button', { name: /iniciar sesión de nuevo/i }))

  expect(logout).toHaveBeenCalled()
  expect(await screen.findByText('Pantalla de login')).toBeInTheDocument()
})
