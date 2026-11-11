import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CashMovementRow } from '../../infrastructure/database/schema'
import type { CashMovementInput } from '../../application/use-cases/shifts/cash-movement'
import { Button, Input } from '../../shared/ui'

interface Props {
  movement?: CashMovementRow
  categories: string[]
  onSave: (input: CashMovementInput) => Promise<void>
  onCancel: () => void
}

export default function CashMovementPanel({ movement, categories, onSave, onCancel }: Props) {
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAWAL'>(movement?.type ?? 'WITHDRAWAL')
  const [amount, setAmount] = useState(movement ? String(movement.amountPesos) : '')
  const [reason, setReason] = useState(movement?.reason ?? '')
  const [isExpense, setIsExpense] = useState(Boolean(movement?.expenseCategoryName))
  const [category, setCategory] = useState(
    movement?.expenseCategoryName ?? categories[0] ?? 'Otros'
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSave({
        type,
        amountPesos: Number(amount),
        reason,
        isExpense: type === 'WITHDRAWAL' && isExpense,
        expenseCategoryName: type === 'WITHDRAWAL' && isExpense ? category : null
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar el movimiento')
      setSaving(false)
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          {movement ? 'Editar movimiento' : 'Nuevo movimiento'}
        </h3>
        {movement ? <span className="text-xs text-gray-500">{movement.reason}</span> : null}
      </div>
      <form className="space-y-3" onSubmit={onSubmit}>
        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">Tipo</span>
          <div role="group" aria-label="Tipo de movimiento"
            className="inline-flex rounded-lg border border-gray-300 bg-white p-1">
            <button
              type="button"
              aria-pressed={type === 'DEPOSIT'}
              onClick={() => setType('DEPOSIT')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                type === 'DEPOSIT' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Ingreso
            </button>
            <button
              type="button"
              aria-pressed={type === 'WITHDRAWAL'}
              onClick={() => setType('WITHDRAWAL')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                type === 'WITHDRAWAL' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Retiro
            </button>
          </div>
        </div>
        <label className="block text-sm font-medium text-gray-700">
          Monto
          <Input className="mt-1" type="number" inputMode="numeric" min={1} value={amount}
            onChange={(event) => setAmount(event.target.value)} required />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Motivo
          <Input className="mt-1" value={reason}
            onChange={(event) => setReason(event.target.value)} required />
        </label>
        {type === 'WITHDRAWAL' ? (
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={isExpense}
              onChange={(event) => setIsExpense(event.target.checked)} />
            Es gasto
          </label>
        ) : null}
        {type === 'WITHDRAWAL' && isExpense ? (
          <label className="block text-sm font-medium text-gray-700">
            Categoría
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required
            >
              {categories.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? 'Guardando…' : movement ? 'Guardar cambios' : 'Guardar movimiento'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      </form>
    </section>
  )
}
