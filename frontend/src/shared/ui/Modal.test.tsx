import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { Modal } from './Modal'

it('enfoca el primer control y cierra con Escape', async () => {
  const onClose = vi.fn()
  render(
    <Modal title="Probar" onClose={onClose}>
      <button>Uno</button>
      <button>Dos</button>
    </Modal>
  )

  expect(screen.getByRole('dialog', { name: 'Probar' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Uno' })).toHaveFocus()

  await userEvent.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalled()
})

it('mantiene el foco dentro del diálogo al tabular', async () => {
  render(
    <Modal title="Probar" onClose={vi.fn()}>
      <button>Uno</button>
      <button>Dos</button>
    </Modal>
  )

  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Dos' })).toHaveFocus()

  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Uno' })).toHaveFocus()
})
