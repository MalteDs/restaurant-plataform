import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { openDb, type CajaDb, type OperationRow } from '../database/schema'
import { exportPending } from './export'
import { importPending } from './import'

const opened: CajaDb[] = []

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

function operation(id: string, seq: number): OperationRow {
  return {
    operationId: id,
    seq,
    type: 'CREATE_SALE',
    userId: 'u1',
    clientCreatedAt: new Date().toISOString(),
    payload: { id },
    status: 'LOCAL_PENDING',
    attempts: 0
  }
}

async function seed(ids: string[]) {
  const db = openDb(`test-recovery-${crypto.randomUUID()}`)
  opened.push(db)
  await db.operations.bulkPut(ids.map((id, index) => operation(id, index + 1)))
  await db.meta.put({ key: 'devicePrefix', value: 'ALM-B' })
  await db.meta.put({ key: 'operationSeq', value: 7 })
  return db
}

it('exporta e importa sin duplicar', async () => {
  const db = await seed(['op-1', 'op-2'])
  const name = db.name
  const blob = await exportPending(db)
  await db.delete()
  const reopened = openDb(name)
  opened.push(reopened)

  await importPending(blob, reopened)
  await importPending(blob, reopened)

  expect(await reopened.operations.count()).toBe(2)
  expect((await reopened.meta.get('devicePrefix'))?.value).toBe('ALM-B')
  expect((await reopened.meta.get('operationSeq'))?.value).toBe(7)
})

it('rechaza un archivo corrupto sin tocar la base', async () => {
  const db = await seed(['op-1'])

  await expect(importPending(new Blob(['basura']), db)).rejects.toThrow()
  expect(await db.operations.count()).toBe(1)
})
