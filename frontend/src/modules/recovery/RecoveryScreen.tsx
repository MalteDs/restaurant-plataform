import { useEffect, useRef, useState } from 'react'
import { db } from '../../infrastructure/database/schema'
import { chooseExportFolder, exportPending, exportToFolder, startAutoExport } from '../../infrastructure/recovery/export'
import { importPending } from '../../infrastructure/recovery/import'
import { Button, Card, FormError, PageHeader } from '../../shared/ui'

export default function RecoveryScreen() {
  const [pending, setPending] = useState(0)
  const [lastExport, setLastExport] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const folder = useRef<{ name: string } & Parameters<typeof exportToFolder>[1] | null>(null)
  const [folderName, setFolderName] = useState('')

  async function refresh() {
    setPending(await db.operations.where('status').anyOf(['LOCAL_PENDING', 'SYNC_ERROR']).count())
    const meta = await db.meta.get('lastRecoveryExport')
    setLastExport(typeof meta?.value === 'string' ? meta.value : '')
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function onChooseFolder() {
    const handle = await chooseExportFolder()
    if (!handle) {
      setError('Este navegador no permite elegir carpeta; usa la descarga manual')
      return
    }
    folder.current = handle
    setFolderName(handle.name)
    startAutoExport(db, handle)
  }

  async function onExport() {
    setError('')
    const blob = await exportPending(db)
    const now = new Date().toISOString()
    await db.meta.put({ key: 'lastRecoveryExport', value: now })
    if (typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `caja-pendientes-${now.slice(0, 19).replace(/[:T]/g, '-')}.jsonl`
      link.click()
      URL.revokeObjectURL(url)
    }
    setMessage('Respaldo exportado')
    await refresh()
  }

  async function onImport(file: File) {
    if (!window.confirm('Esto restaurará ventas pendientes. ¿Continuar?')) {
      return
    }
    if (!window.confirm('Confirma una vez más: la restauración no se puede deshacer.')) {
      return
    }
    setError('')
    setMessage('')
    try {
      const result = await importPending(file, db)
      setMessage(`Importadas ${result.imported}, omitidas ${result.skipped}`)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo restaurar')
    }
  }

  return (
    <div>
      <PageHeader title="Recuperación" subtitle="Exporta y restaura ventas pendientes" />
      <Card className="max-w-lg space-y-4">
        <p className="text-sm text-gray-600">
          Pendientes: <strong>{pending}</strong>
          {lastExport ? ` · último respaldo ${new Date(lastExport).toLocaleString('es-CO')}` : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onExport}>Exportar pendientes</Button>
          <Button variant="ghost" onClick={() => void onChooseFolder()}>
            {folderName ? `Carpeta: ${folderName}` : 'Elegir carpeta de respaldo'}
          </Button>
          <Button variant="ghost" onClick={() => fileInput.current?.click()}>
            Restaurar desde archivo
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".jsonl,application/x-ndjson,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                void onImport(file)
              }
              event.target.value = ''
            }}
          />
        </div>
        {message ? <p className="text-sm text-green-700">{message}</p> : null}
        <FormError>{error}</FormError>
      </Card>
    </div>
  )
}
