import { db, type CajaDb } from '../database/schema'
import type { RecoveryRecord } from './export'

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

export async function importPending(
  file: Blob,
  database: CajaDb = db
): Promise<{ imported: number; skipped: number }> {
  const text = await readBlob(file)
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length === 0) {
    throw new Error('El archivo está vacío')
  }

  let header: { version?: number }
  try {
    header = JSON.parse(lines[0])
  } catch {
    throw new Error('El archivo está corrupto')
  }
  if (header.version !== 1) {
    throw new Error('Versión de archivo no soportada')
  }

  // Parse everything before writing so a corrupt line never touches the database.
  const records: RecoveryRecord[] = lines.slice(1).map((line) => {
    try {
      const record = JSON.parse(line)
      if (record?.kind !== 'operation' || !record.operation?.operationId) {
        throw new Error('registro inválido')
      }
      return record
    } catch {
      throw new Error('El archivo está corrupto')
    }
  })

  return database.transaction(
    'rw',
    [database.operations, database.sales, database.saleItems, database.payments, database.refunds],
    async () => {
      let imported = 0
      let skipped = 0
      for (const record of records) {
        if (await database.operations.get(record.operation.operationId)) {
          skipped++
          continue
        }
        await database.operations.add(record.operation)
        if (record.sale) {
          await database.sales.put(record.sale as never)
        }
        if (record.saleItems) {
          await database.saleItems.bulkPut(record.saleItems as never[])
        }
        if (record.payment) {
          await database.payments.put(record.payment as never)
        }
        if (record.refund) {
          await database.refunds.put(record.refund as never)
        }
        imported++
      }
      return { imported, skipped }
    }
  )
}
