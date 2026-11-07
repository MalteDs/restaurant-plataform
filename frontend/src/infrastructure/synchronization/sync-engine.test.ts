import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { openDb, type CajaDb, type OperationRow } from '../../infrastructure/database/schema'
import { pushPending, type SyncApi } from './sync-engine'

const opened: CajaDb[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

async function seed(ids: string[]) {
  const db = openDb(`test-sync-${crypto.randomUUID()}`)
  opened.push(db)
  const operations: OperationRow[] = ids.map((operationId, index) => ({
    operationId,
    seq: index + 1,
    type: 'CREATE_SALE',
    entityId: `sale-${index}`,
    userId: 'u1',
    clientCreatedAt: new Date().toISOString(),
    payload: { index },
    status: 'LOCAL_PENDING',
    attempts: 0
  }))
  await db.operations.bulkPut(operations)
  return db
}

it('reintenta sin duplicar y respeta RETRY', async () => {
  const db = await seed(['op-1', 'op-2'])
  const api: SyncApi = {
    post: vi.fn().mockResolvedValue({
      operations: [
        { operationId: 'op-1', status: 'APPLIED' },
        { operationId: 'op-2', status: 'RETRY' }
      ]
    })
  }

  await pushPending(db, api)

  expect(await db.operations.get('op-1')).toMatchObject({ status: 'SYNCED' })
  expect(await db.operations.get('op-2')).toMatchObject({
    status: 'LOCAL_PENDING',
    attempts: 1
  })
  expect(await db.operations.count()).toBe(2)
  expect(api.post).toHaveBeenCalledTimes(1)
})

it('no intenta sincronizar sin red y no pierde la cola', async () => {
  const db = await seed(['op-1', 'op-2'])
  const api: SyncApi = { post: vi.fn() }
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

  const result = await pushPending(db, api)

  expect(result.status).toBe('offline')
  expect(api.post).not.toHaveBeenCalled()
  expect(await db.operations.count()).toBe(2)
  expect(await db.operations.where('status').equals('LOCAL_PENDING').count()).toBe(2)
})

it('marca error y programa reintento cuando el servidor no responde', async () => {
  const db = await seed(['op-1'])
  const api: SyncApi = { post: vi.fn().mockRejectedValue(new Error('down')) }

  const result = await pushPending(db, api)

  expect(result.status).toBe('error')
  const operation = await db.operations.get('op-1')
  expect(operation?.attempts).toBe(1)
  expect(operation?.nextRetryAt).toBeDefined()
})
