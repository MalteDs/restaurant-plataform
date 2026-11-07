import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { openDb } from '../../infrastructure/database/schema'
import { hashPin, verifyPin } from './pin'

const opened: Array<ReturnType<typeof openDb>> = []

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

it('no desbloquea con PIN incorrecto', async () => {
  const db = openDb('test-pin')
  opened.push(db)
  await db.users.put({ id: 'u1', username: 'ana', role: 'CASHIER', pinHash: await hashPin('1234') })

  expect(await verifyPin('u1', '0000', db)).toBe(false)
  expect(await verifyPin('u1', '1234', db)).toBe(true)
})
