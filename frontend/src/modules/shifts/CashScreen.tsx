import { useEffect, useState } from 'react'
import { db, type CajaDb } from '../../infrastructure/database/schema'
import { closeShift, expectedCash } from '../../application/use-cases/shifts/close-shift'
import { openShift } from '../../application/use-cases/shifts/open-shift'
import { exportSummaryCsv, localSummary } from '../../application/use-cases/reports/local-summary'
import { Button, Card, Input, PageHeader } from '../../shared/ui'

export default function CashScreen({ database = db }: { database?: CajaDb }) {
  const [shiftId, setShiftId] = useState<string | null>(null)
  const [operationalDate, setOperationalDate] = useState('')
  const [expected, setExpected] = useState(0)
  const [opening, setOpening] = useState('50000')
  const [counted, setCounted] = useState('')
  const [difference, setDifference] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function refresh() {
    const shift = (await database.shifts.toArray()).find((row) => row.closedAt === null)
    const expectedPesos = shift ? await expectedCash(database, shift.id) : 0
    setExpected(expectedPesos)
    setShiftId(shift?.id ?? null)
    setOperationalDate(shift?.operationalDate ?? new Date().toISOString().slice(0, 10))
  }

  useEffect(() => {
    void refresh()
  }, [database])

  async function onOpen() {
    setError('')
    try {
      await openShift(database, Number(opening) || 0)
      setDifference(null)
      setCounted('')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo abrir el turno')
    }
  }

  async function onClose() {
    setError('')
    try {
      const result = await closeShift(database, { countedCashPesos: Number(counted) || 0 })
      setDifference(result.differencePesos)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cerrar el turno')
    }
  }

  async function onExport() {
    const summary = await localSummary(database, operationalDate, operationalDate)
    const blob = exportSummaryCsv(summary)
    if (typeof URL.createObjectURL !== 'function') {
      return
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `resumen-${operationalDate}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader title="Caja" subtitle="Apertura, arqueo y cierre del turno" />
      <Card className="max-w-lg">
        {shiftId ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Turno abierto · efectivo esperado{' '}
              <span data-testid="expected" className="font-semibold text-gray-900">
                ${expected.toLocaleString('es-CO')}
              </span>
            </p>
            <label className="block text-sm font-medium text-gray-700">
              Efectivo contado
              <Input
                className="mt-1"
                type="number"
                min={0}
                value={counted}
                onChange={(event) => setCounted(event.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <Button onClick={onClose}>Cerrar turno</Button>
              <Button variant="ghost" onClick={onExport}>Exportar CSV</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">No hay turno abierto.</p>
            <label className="block text-sm font-medium text-gray-700">
              Fondo inicial
              <Input
                className="mt-1"
                type="number"
                min={0}
                value={opening}
                onChange={(event) => setOpening(event.target.value)}
              />
            </label>
            <Button onClick={onOpen}>Abrir turno</Button>
          </div>
        )}
        {difference !== null ? (
          <p className="mt-4 border-t border-gray-200 pt-3 text-sm">
            Diferencia:{' '}
            <span data-testid="difference" className="font-semibold text-gray-900">
              ${difference.toLocaleString('es-CO')}
            </span>
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </Card>
    </div>
  )
}
