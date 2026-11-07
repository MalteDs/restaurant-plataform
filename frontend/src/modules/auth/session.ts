import type { CajaDb, Role } from '../../infrastructure/database/schema'
import { hashPin, verifyPin } from './pin'

const SESSION_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export interface SessionUser {
  id: string
  username: string
  role: Role
  tenantId?: string
  locationId?: string
}

export interface OfflineSession {
  user: SessionUser
  deviceToken?: string
  expiresAt: string
}

export async function saveOfflineSession(
  database: CajaDb,
  user: SessionUser,
  pin: string,
  deviceToken?: string,
  now = Date.now()
): Promise<void> {
  const pinHash = await hashPin(pin)
  await database.users.put({
    ...user,
    pinHash,
    deviceToken,
    sessionCreatedAt: new Date(now).toISOString(),
    sessionExpiresAt: new Date(now + SESSION_DAYS * DAY_MS).toISOString()
  })
  await database.meta.put({ key: 'activeUserId', value: user.id })
}

export async function unlockOfflineSession(
  database: CajaDb,
  userId: string,
  pin: string,
  now = Date.now()
): Promise<OfflineSession | null> {
  const user = await database.users.get(userId)
  if (!user?.pinHash || !user.sessionExpiresAt) {
    return null
  }
  if (Date.parse(user.sessionExpiresAt) <= now) {
    return null
  }
  if (!(await verifyPin(userId, pin, database))) {
    return null
  }
  return {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
      locationId: user.locationId
    },
    deviceToken: user.deviceToken,
    expiresAt: user.sessionExpiresAt
  }
}

export async function activeUserId(database: CajaDb): Promise<string | null> {
  const meta = await database.meta.get('activeUserId')
  return typeof meta?.value === 'string' ? meta.value : null
}
