import { render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { AuthProvider } from '../../app/providers/AuthProvider'
import ExpensesScreen from './ExpensesScreen'

afterEach(() => {
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
