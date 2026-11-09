import { useEffect, useState } from 'react'
import { OPERATION_QUEUED } from './notify'
import { db, type CajaDb } from '../../infrastructure/database/schema'
import { ApiError, request } from '../api/client'

const BATCH_SIZE = 50
const BASE_BACKOFF_MS = 5_000
const MAX_BACKOFF_MS = 5 * 60_000

export type RemoteStatus = 'APPLIED' | 'DUPLICATE' | 'RETRY' | 'REJECTED'

export interface SyncResponse {
  operations: Array<{
    operationId: string
    status: RemoteStatus
    result?: unknown
    error?: string
  }>
}

export interface SyncApi {
  post: (body: unknown) => Promise<SyncResponse>
}

export type EngineStatus = 'pending' | 'syncing' | 'error' | 'up-to-date' | 'offline' | 'unregistered' | 'auth-error'

// Evita repetir un 401 con el mismo token hasta que se registre uno nuevo.
let rejectedDeviceToken: string | null = null

const defaultApi: SyncApi = {
  post: (body) =>
    request<SyncResponse>('/api/sync/operations', {
      method: 'POST',
      body: JSON.stringify(body)
    })
}

function backoff(attempts: number, now: number): string {
  return new Date(now + Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS)).toISOString()
}

function toWire(operation: {
  operationId: string
  seq: number
  type: string
  entityId?: string
  userId: string
  clientCreatedAt: string
  payload: unknown
}) {
  return {
    operationId: operation.operationId,
    seq: operation.seq,
    type: operation.type,
    entityId: operation.entityId,
    userId: operation.userId,
    clientCreatedAt: operation.clientCreatedAt,
    payload: operation.payload
  }
}

export async function pushPending(
  database: CajaDb = db,
  api: SyncApi = defaultApi,
  now = Date.now()
): Promise<{ status: EngineStatus; pushed: number }> {
  if (!navigator.onLine) {
    return { status: 'offline', pushed: 0 }
  }

  const deviceToken = localStorage.getItem('caja.deviceToken')
  if (!deviceToken) {
    return { status: 'unregistered', pushed: 0 }
  }
  if (rejectedDeviceToken === deviceToken) {
    return { status: 'auth-error', pushed: 0 }
  }

  const queued = await database.operations
    .where('status')
    .anyOf(['LOCAL_PENDING', 'SYNC_ERROR'])
    .toArray()
  const due = queued
    .filter((operation) => !operation.nextRetryAt || Date.parse(operation.nextRetryAt) <= now)
    .sort((left, right) => left.seq - right.seq)
    .slice(0, BATCH_SIZE)

  if (due.length === 0) {
    return { status: 'up-to-date', pushed: 0 }
  }

  let response: SyncResponse
  try {
    response = await api.post({ operations: due.map(toWire) })
  } catch (caught) {
    const unauthorized = caught instanceof ApiError && caught.status === 401
    if (unauthorized) {
      rejectedDeviceToken = deviceToken
    }
    await database.transaction('rw', database.operations, async () => {
      for (const operation of due) {
        const attempts = operation.attempts + 1
        await database.operations.update(operation.operationId, {
          attempts,
          nextRetryAt: backoff(attempts, now),
          error: unauthorized ? 'Dispositivo no autorizado' : 'Sin conexión con el servidor'
        })
      }
    })
    return { status: unauthorized ? 'auth-error' : 'error', pushed: 0 }
  }

  let synced = 0
  await database.transaction('rw', database.operations, async () => {
    for (const result of response.operations) {
      const operation = await database.operations.get(result.operationId)
      if (!operation) {
        continue
      }
      if (result.status === 'APPLIED' || result.status === 'DUPLICATE') {
        synced++
        await database.operations.update(result.operationId, {
          status: 'SYNCED',
          error: undefined,
          nextRetryAt: undefined
        })
      } else if (result.status === 'RETRY') {
        const attempts = operation.attempts + 1
        await database.operations.update(result.operationId, {
          status: 'LOCAL_PENDING',
          attempts,
          nextRetryAt: backoff(attempts, now),
          error: result.error ?? 'Reintentar'
        })
      } else {
        const attempts = operation.attempts + 1
        await database.operations.update(result.operationId, {
          status: 'SYNC_ERROR',
          attempts,
          nextRetryAt: backoff(attempts, now),
          error: result.error ?? 'Operación rechazada'
        })
      }
    }
  })

  const remaining = await database.operations
    .where('status')
    .anyOf(['LOCAL_PENDING', 'SYNC_ERROR'])
    .count()
  return { status: remaining === 0 ? 'up-to-date' : synced > 0 ? 'pending' : 'error', pushed: synced }
}

export async function engineStatus(database: CajaDb = db): Promise<EngineStatus> {
  if (!navigator.onLine) {
    return 'offline'
  }
  const deviceToken = localStorage.getItem('caja.deviceToken')
  if (!deviceToken) {
    return 'unregistered'
  }
  if (rejectedDeviceToken === deviceToken) {
    return 'auth-error'
  }
  const pending = await database.operations.where('status').anyOf(['LOCAL_PENDING', 'SYNC_ERROR']).count()
  if (pending === 0) {
    return 'up-to-date'
  }
  const failed = await database.operations.where('status').equals('SYNC_ERROR').count()
  return failed > 0 ? 'error' : 'pending'
}

export function startSyncEngine(
  onChange: (status: EngineStatus) => void,
  database: CajaDb = db,
  api: SyncApi = defaultApi
): () => void {
  let running = false
  let stopped = false

  const run = async () => {
    if (running || stopped) {
      return
    }
    running = true
    onChange('syncing')
    try {
      const outcome = await pushPending(database, api)
      onChange(outcome.status)
    } finally {
      running = false
    }
  }

  const onOnline = () => void run()
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      void run()
    }
  }

  void run()
  window.addEventListener('online', onOnline)
  window.addEventListener(OPERATION_QUEUED, onOnline)
  document.addEventListener('visibilitychange', onVisible)
  const timer = window.setInterval(() => void run(), 30_000)

  return () => {
    stopped = true
    window.clearInterval(timer)
    window.removeEventListener('online', onOnline)
    window.removeEventListener(OPERATION_QUEUED, onOnline)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

export function useSyncStatus(): EngineStatus {
  const [status, setStatus] = useState<EngineStatus>('pending')

  useEffect(() => startSyncEngine(setStatus), [])

  return status
}
