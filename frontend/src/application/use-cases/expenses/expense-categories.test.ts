import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { openDb, type CajaDb } from '../../../infrastructure/database/schema'
import { availableExpenseCategories, refreshExpenseCategories } from './expense-categories'

const opened: CajaDb[] = []

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

function open() {
  const db = openDb(`test-categories-${crypto.randomUUID()}`)
  opened.push(db)
  return db
}

it('siembra las seis categorías al crear la base', async () => {
  const db = open()
  expect(await db.expenseCategories.count()).toBe(6)
})

it('reemplaza la caché por las categorías activas del servidor', async () => {
  const db = open()
  await refreshExpenseCategories(db, async () => [
    { id: '1', name: 'Fruver', sortOrder: 1, active: true },
    { id: '2', name: 'Vieja', sortOrder: 2, active: false }
  ])
  expect(await availableExpenseCategories(db)).toEqual(['Fruver'])
})

it('si el servidor falla, conserva la caché', async () => {
  const db = open()
  await expect(refreshExpenseCategories(db, async () => {
    throw new Error('sin red')
  })).rejects.toThrow()
  expect(await availableExpenseCategories(db)).toContain('Fruver')
})
