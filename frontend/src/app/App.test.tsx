import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './providers/AuthProvider'

it('redirige a login sin sesión', async () => {
  render(
    <MemoryRouter
      initialEntries={['/sale']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  )

  expect(await screen.findByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument()
})
