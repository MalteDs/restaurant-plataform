import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CashMovementRow } from '../../infrastructure/database/schema'
import type { CashMovementInput } from '../../application/use-cases/shifts/cash-movement'
import { Button, Card, Input } from '../../shared/ui'

interface Props {
  movement?: CashMovementRow
  categories: string[]
  initialType?: 'DEPOSIT' | 'WITHDRAWAL'
  initialExpense?: boolean
  onSave: (input: CashMovementInput) => Promise<void>
  onCancel: () => void
}

export default function CashMovementPanel({
  movement,
  categories,
  initialType = 'WITHDRAWAL',
  initialExpense = false,
  onSave,
  onCancel
}: Props) {
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAWAL'>(movement?.type ?? initialType)
  const [amount, setAmount] = useState(movement ? String(movement.amountPesos) : '')
  const [reason, setReason] = useState(movement?.reason ?? '')
  const [isExpense, setIsExpense] = useState(
    Boolean(movement?.expenseCategoryName) || initialExpense
  )
  const [category, setCategory] = useState(
    movement?.expenseCategoryName ?? categories[0] ?? 'Otros'
  )
  const [error, setError] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
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
    }
  }

  return (
    <Card className="mt-4 bg-gray-50">
      <form className="space-y-3" onSubmit={onSubmit}>
        <label className="block text-sm font-medium text-gray-700">
          Tipo
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={type}
            onChange={(event) => setType(event.target.value as 'DEPOSIT' | 'WITHDRAWAL')}
          >
            <option value="DEPOSIT">Ingreso</option>
            <option value="WITHDRAWAL">Retiro</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Monto
          <Input className="mt-1" type="number" min={1} value={amount}
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
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required
            >
              {categories.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit">{movement ? 'Guardar cambios' : 'Guardar movimiento'}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Card>
  )
}
