import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import SaleDaysPicker from './SaleDaysPicker'

it('marca días y aplica atajos', async () => {
  const onChange = vi.fn()
  const { rerender } = render(<SaleDaysPicker value={[]} onChange={onChange} />)

  await userEvent.click(screen.getByLabelText(/^lunes$/i))
  expect(onChange).toHaveBeenCalledWith([1])

  rerender(<SaleDaysPicker value={[1, 2]} onChange={onChange} />)
  await userEvent.click(screen.getByRole('button', { name: /lun-jue/i }))
  expect(onChange).toHaveBeenCalledWith([1, 2, 3, 4])

  await userEvent.click(screen.getByRole('button', { name: /^todos$/i }))
  expect(onChange).toHaveBeenCalledWith([])
})
