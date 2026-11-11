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
  const [saving, setSaving] = useState(false)
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
    const message = `¿Cerrar el turno?\nContado: $${counted.toLocaleString('es-CO')}\n`
      + `Esperado: $${expectedPesos.toLocaleString('es-CO')}\n`
      + `Diferencia: $${difference.toLocaleString('es-CO')}`
    if (!window.confirm(message)) {
      return
    }
    setSaving(true)
    try {
      await closeShift(database, {
        countedCashPesos: counted,
        countedBreakdown: breakdown,
        closeNote: note
      })
      await onClosed()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cerrar el turno')
      setSaving(false)
    }
  }

  return (
    <Card className="bg-gray-50">
      <form className="space-y-3" onSubmit={onSubmit}>
        <h2 className="text-sm font-semibold text-gray-900">Contar efectivo</h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {DENOMINATIONS.map((denomination) => {
            const key = String(denomination)
            const label = `Cantidad de ${denomination.toLocaleString('es-CO')}`
            return (
              <label key={key}
                className="flex items-center justify-between gap-2 text-sm text-gray-700">
                <span aria-hidden="true">${denomination.toLocaleString('es-CO')}</span>
                <div className="w-20">
                  <Input className="text-right" type="number" inputMode="numeric" min={0}
                    aria-label={label} value={counts[key] ?? ''}
                    onChange={(event) => setCounts({ ...counts, [key]: event.target.value })} />
                </div>
              </label>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
          <div>
            <p className="text-gray-500">Total contado</p>
            <p data-testid="counted" className="font-semibold text-gray-900">
              ${counted.toLocaleString('es-CO')}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Diferencia</p>
            <p data-testid="difference" className="font-semibold text-gray-900">
              ${difference.toLocaleString('es-CO')}
            </p>
          </div>
        </div>
        <label className="block text-sm font-medium text-gray-700">
          Nota del cierre
          <Input className="mt-1" value={note}
            onChange={(event) => setNote(event.target.value)} />
        </label>
        <Button type="submit" disabled={saving} aria-busy={saving}>
          {saving ? 'Cerrando…' : 'Cerrar turno'}
        </Button>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Card>
  )
}
