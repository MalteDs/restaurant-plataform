import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { openDb, type CajaDb } from '../../infrastructure/database/schema'
import SaleScreen from './SaleScreen'

const opened: CajaDb[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

it('un doble clic crea una sola venta', async () => {
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  await db.products.put({
    id: 'p1',
    name: 'SENCILLA',
    categoryName: 'HAMBURGUESAS',
    kind: 'PRODUCT',
    pricePesos: 16500,
    costPesos: null,
    sortOrder: 1,
    active: true,
    modifierGroupIds: [],
    components: []
  })
  const create = vi.fn().mockResolvedValue({
    saleId: 's1',
    displayCode: 'ALM-A-000001',
    totalPesos: 16500
  })

  render(<SaleScreen database={db} onCreateSale={create} />)
  await userEvent.click(await screen.findByRole('button', { name: /sencilla/i }, { timeout: 5000 }))
  await userEvent.dblClick(screen.getByRole('button', { name: /cobrar/i }))

  expect(create).toHaveBeenCalledTimes(1)
})
