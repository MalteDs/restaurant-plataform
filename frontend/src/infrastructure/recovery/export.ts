import { db, type CajaDb, type OperationRow } from '../database/schema'

export interface RecoverySale {
  sale?: unknown
  saleItems?: unknown[]
  payment?: unknown
  refund?: unknown
}

export interface RecoveryRecord extends RecoverySale {
  kind: 'operation'
  operation: OperationRow
}

const HEADER_VERSION = 1

export async function exportPending(database: CajaDb = db, now = new Date()): Promise<Blob> {
  const operations = await database.operations
    .where('status')
    .anyOf(['LOCAL_PENDING', 'SYNC_ERROR'])
    .toArray()

  const lines = [
    JSON.stringify({
      version: HEADER_VERSION,
      deviceId: (await database.meta.get('devicePrefix'))?.value ?? 'unknown',
      exportedAt: now.toISOString()
    })
  ]

  for (const operation of operations) {
    const record: RecoveryRecord = { kind: 'operation', operation }
    if (operation.entityId) {
      if (operation.type === 'CREATE_SALE') {
        record.sale = await database.sales.get(operation.entityId)
        record.saleItems = await database.saleItems
          .where('saleId')
          .equals(operation.entityId)
          .toArray()
        record.payment = (await database.payments.toArray())
          .find((payment) => payment.saleId === operation.entityId)
      }
      if (operation.type === 'REFUND_SALE') {
        record.sale = await database.sales.get(operation.entityId)
        record.refund = (await database.refunds.toArray())
          .find((refund) => refund.saleId === operation.entityId)
      }
    }
    lines.push(JSON.stringify(record))
  }

  return new Blob([lines.join('\n')], { type: 'application/x-ndjson' })
}

interface WritableLike {
  write: (data: Blob) => Promise<void>
  close: () => Promise<void>
}

interface DirectoryHandleLike {
  name: string
  getFileHandle: (name: string, options: { create: boolean }) => Promise<{
    createWritable: () => Promise<WritableLike>
  }>
}

export async function chooseExportFolder(): Promise<DirectoryHandleLike | null> {
  const picker = (window as unknown as {
    showDirectoryPicker?: (options: { mode: string }) => Promise<DirectoryHandleLike>
  }).showDirectoryPicker
  if (!picker) {
    return null
  }
  return picker({ mode: 'readwrite' })
}

export async function exportToFolder(
  database: CajaDb,
  handle: DirectoryHandleLike,
  now = new Date()
): Promise<string> {
  const blob = await exportPending(database, now)
  const name = `caja-pendientes-${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jsonl`
  const file = await handle.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  await writable.write(blob)
  await writable.close()
  return name
}

export function startAutoExport(
  database: CajaDb,
  handle: DirectoryHandleLike,
  intervalMs = 5 * 60_000
): () => void {
  const timer = window.setInterval(() => {
    void exportToFolder(database, handle)
  }, intervalMs)
  return () => window.clearInterval(timer)
}
