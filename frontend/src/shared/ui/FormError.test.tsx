import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { FormError } from './index'

it('anuncia el error como alerta', () => {
  render(<FormError>No se pudo guardar</FormError>)

  expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar')
})
