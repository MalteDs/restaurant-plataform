import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './providers/AuthProvider'

it('redirige a login sin sesión', async () => {
  render(
    <MemoryRouter initialEntries={['/sale']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  )

  expect(await screen.findByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument()
})
