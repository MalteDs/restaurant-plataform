import { render, screen, waitFor } from '@testing-library/react'
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

it('recupera el foco si se pierde fuera del diálogo', async () => {
  render(
    <>
      <Modal title="Probar" onClose={vi.fn()}>
        <button>Uno</button>
        <button>Dos</button>
      </Modal>
      <button>Fondo</button>
    </>
  )

  screen.getByRole('button', { name: 'Fondo' }).focus()
  await userEvent.tab()

  expect(screen.getByRole('button', { name: 'Uno' })).toHaveFocus()
})

it('restaura el foco al cerrar', async () => {
  const trigger = document.createElement('button')
  trigger.textContent = 'Origen'
  document.body.appendChild(trigger)
  trigger.focus()

  const { unmount } = render(
    <Modal title="Probar" onClose={vi.fn()}>
      <button>Cerrar diálogo</button>
    </Modal>
  )
  unmount()

  await waitFor(() => expect(trigger).toHaveFocus())
  trigger.remove()
})
