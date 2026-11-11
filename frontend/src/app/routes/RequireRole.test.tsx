import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { RequireRole } from './RequireRole'

vi.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { role: 'CASHIER' } })
}))

it('un cajero no entra a reportes', () => {
  render(
    <MemoryRouter initialEntries={['/reports']}>
      <Routes>
        <Route element={<RequireRole roles={['MANAGER', 'ADMIN']} />}>
          <Route path="/reports" element={<div>Reportes</div>} />
        </Route>
        <Route path="/sale" element={<div>Venta</div>} />
      </Routes>
    </MemoryRouter>
  )

  expect(screen.getByText('Venta')).toBeInTheDocument()
  expect(screen.queryByText('Reportes')).not.toBeInTheDocument()
})
