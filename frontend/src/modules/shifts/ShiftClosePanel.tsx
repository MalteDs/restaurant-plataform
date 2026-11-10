import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CajaDb } from '../../infrastructure/database/schema'
import { closeShift } from '../../application/use-cases/shifts/close-shift'
import { DENOMINATIONS, denominationTotal } from '../../shared/denominations'
import { Button, Card, Input } from '../../shared/ui'

interface Props {
  database: CajaDb
  expectedPesos: number
  onClosed: () => Promise<void>
}

export default function ShiftClosePanel({ database, expectedPesos, onClosed }: Props) {
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const breakdown = Object.fromEntries(
    Object.entries(counts)
      .map(([denomination, value]) => [denomination, Number(value || 0)] as const)
      .filter(([, value]) => value > 0)
  )
  const counted = denominationTotal(breakdown)
  const difference = counted - expectedPesos

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await closeShift(database, {
        countedCashPesos: counted,
        countedBreakdown: breakdown,
        closeNote: note
      })
      await onClosed()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cerrar el turno')
    }
  }

  return (
    <Card className="mt-4 bg-gray-50">
      <form className="space-y-3" onSubmit={onSubmit}>
        <h3 className="text-sm font-semibold text-gray-900">Contar efectivo</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DENOMINATIONS.map((denomination) => {
            const key = String(denomination)
            return (
              <label key={key} className="block text-sm font-medium text-gray-700">
                Cantidad de {denomination.toLocaleString('es-CO')}
                <Input className="mt-1" type="number" min={0} value={counts[key] ?? ''}
                  onChange={(event) => setCounts({ ...counts, [key]: event.target.value })} />
              </label>
            )
          })}
        </div>
        <p className="text-sm text-gray-700">
          Total contado:{' '}
          <span data-testid="counted" className="font-semibold text-gray-900">
            ${counted.toLocaleString('es-CO')}
          </span>
        </p>
        <p className="text-sm text-gray-700">
          Diferencia:{' '}
          <span data-testid="difference" className="font-semibold text-gray-900">
            ${difference.toLocaleString('es-CO')}
          </span>
        </p>
        <label className="block text-sm font-medium text-gray-700">
          Nota del cierre
          <Input className="mt-1" value={note}
            onChange={(event) => setNote(event.target.value)} />
        </label>
        <Button type="submit">Cerrar turno</Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Card>
  )
}
