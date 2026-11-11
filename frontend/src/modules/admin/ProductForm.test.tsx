import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import ProductForm from './ProductForm'

const categories = [{ id: 'c1', name: 'HAMBURGUESAS', sortOrder: 1, active: true }]

it('no envía un precio de día igual al precio base', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(
    <ProductForm
      product={null}
      kind="PRODUCT"
      categories={categories}
      addons={[]}
      ingredients={[]}
      onSave={onSave}
      onCancel={vi.fn()}
    />
  )

  await userEvent.type(screen.getByLabelText(/^nombre$/i), 'SENCILLA')
  await userEvent.type(screen.getByLabelText(/^precio$/i), '16500')
  await userEvent.type(screen.getByLabelText(/precio del lunes/i), '16500')
  await userEvent.type(screen.getByLabelText(/precio del martes/i), '18000')
  await userEvent.click(screen.getByRole('button', { name: /guardar producto/i }))

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    dayPrices: [{ weekday: 2, pricePesos: 18000 }]
  }))
})
