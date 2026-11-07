import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { openDb } from '../../infrastructure/database/schema'
import { saveOfflineSession, unlockOfflineSession, type SessionUser } from './session'

const opened: Array<ReturnType<typeof openDb>> = []

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

const user: SessionUser = {
  id: 'u1',
  username: 'ana',
  role: 'CASHIER',
  tenantId: 't1',
  locationId: 'l1'
}

it('desbloquea la sesion offline con el PIN correcto', async () => {
  const db = openDb('test-session')
  opened.push(db)
  await saveOfflineSession(db, user, '1234', 'device-token')

  expect(await unlockOfflineSession(db, 'u1', '0000')).toBeNull()
  const session = await unlockOfflineSession(db, 'u1', '1234')
  expect(session?.user.username).toBe('ana')
  expect(session?.deviceToken).toBe('device-token')
})

it('la sesion offline expira a los 7 dias', async () => {
  const db = openDb('test-session-expiry')
  opened.push(db)
  const now = Date.parse('2026-11-01T12:00:00Z')
  await saveOfflineSession(db, user, '1234', undefined, now)

  const eightDays = now + 8 * 24 * 60 * 60 * 1000
  expect(await unlockOfflineSession(db, 'u1', '1234', eightDays)).toBeNull()
})
