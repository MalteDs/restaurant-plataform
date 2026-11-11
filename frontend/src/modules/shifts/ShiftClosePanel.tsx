import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CajaDb } from '../../infrastructure/database/schema'
import { closeShift } from '../../application/use-cases/shifts/close-shift'
import type { ShiftClosing } from '../../application/use-cases/reports/shift-closing'
import { DENOMINATIONS, denominationTotal } from '../../shared/denominations'
import { Button, Card, Input } from '../../shared/ui'

interface Props {
  database: CajaDb
  expectedPesos: number
  summary: ShiftClosing | null
  onClosed: () => Promise<void>
}

export default function ShiftClosePanel({ database, expectedPesos, summary, onClosed }: Props) {
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
      <div data-testid="shift-summary" className="mb-4 rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <h3 className="font-semibold text-gray-900">Resumen del turno</h3>
        {summary ? (
          <>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Ventas por medio</p>
            <dl className="mt-1 space-y-1">
              <div className="flex justify-between"><dt>Ventas efectivo</dt>
                <dd>${summary.salesByMethod.CASH.toLocaleString('es-CO')}</dd></div>
              <div className="flex justify-between"><dt>Ventas tarjeta</dt>
                <dd>${summary.salesByMethod.CARD.toLocaleString('es-CO')}</dd></div>
              <div className="flex justify-between"><dt>Ventas Bre-B</dt>
                <dd>${summary.salesByMethod.BREB.toLocaleString('es-CO')}</dd></div>
            </dl>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Devoluciones por medio</p>
            <dl className="mt-1 space-y-1">
              <div className="flex justify-between"><dt>Devoluciones efectivo</dt>
                <dd>${summary.refundsByMethod.CASH.toLocaleString('es-CO')}</dd></div>
              <div className="flex justify-between"><dt>Devoluciones tarjeta</dt>
                <dd>${summary.refundsByMethod.CARD.toLocaleString('es-CO')}</dd></div>
              <div className="flex justify-between"><dt>Devoluciones Bre-B</dt>
                <dd>${summary.refundsByMethod.BREB.toLocaleString('es-CO')}</dd></div>
            </dl>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Movimientos</p>
            <dl className="mt-1 space-y-1">
              <div className="flex justify-between"><dt>Ingresos</dt>
                <dd>${summary.depositsPesos.toLocaleString('es-CO')}</dd></div>
              <div className="flex justify-between"><dt>Retiros</dt>
                <dd>${summary.withdrawalsPesos.toLocaleString('es-CO')}</dd></div>
              <div className="flex justify-between"><dt>Gastos de caja</dt>
                <dd>${summary.cashExpensesPesos.toLocaleString('es-CO')}</dd></div>
            </dl>
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 font-semibold">
              <span>Efectivo esperado</span>
              <span>${expectedPesos.toLocaleString('es-CO')}</span>
            </div>
          </>
        ) : (
          <p className="mt-2 text-gray-500">Cargando resumen…</p>
        )}
      </div>
      <form className="space-y-3" onSubmit={onSubmit}>
        <h3 className="text-sm font-semibold text-gray-900">Contar efectivo</h3>
        <div className="space-y-1.5">
          {DENOMINATIONS.map((denomination) => {
            const key = String(denomination)
            const label = `Cantidad de ${denomination.toLocaleString('es-CO')}`
            return (
              <label key={key} className="flex items-center justify-between gap-3 text-sm text-gray-700">
                <span aria-hidden="true">${denomination.toLocaleString('es-CO')}</span>
                <div className="w-24">
                  <Input className="text-right" type="number" inputMode="numeric" min={0}
                    aria-label={label} value={counts[key] ?? ''}
                    onChange={(event) => setCounts({ ...counts, [key]: event.target.value })} />
                </div>
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
        <Button type="submit" disabled={saving} aria-busy={saving}>
          {saving ? 'Cerrando…' : 'Cerrar turno'}
        </Button>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Card>
  )
}
