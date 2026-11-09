import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../app/providers/AuthProvider'
import { request } from '../../infrastructure/api/client'
import { bogotaDate } from '../../shared/dates'
import { Button, Card, Input, PageHeader } from '../../shared/ui'

interface Expense {
  id: string
  category: string
  description: string
  amountPesos: number
  expenseDate: string
}

interface ExpenseList {
  expenses: Expense[]
  totalPesos: number
}

interface ExpenseCategory {
  id: string
  name: string
  active: boolean
}

export default function ExpensesScreen() {
  const { user } = useAuth()
  const online = navigator.onLine
  const canManage = user?.role === 'MANAGER' || user?.role === 'ADMIN'
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [total, setTotal] = useState(0)
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  const today = bogotaDate()

  async function refresh() {
    if (!navigator.onLine) {
      return
    }
    const [data, available] = await Promise.all([
      request<ExpenseList>(`/api/expenses?from=${today}&to=${today}`),
      request<ExpenseCategory[]>('/api/expenses/categories')
    ])
    setExpenses(data.expenses)
    setTotal(data.totalPesos)
    setCategories(available.filter((category) => category.active))
    if (!available.some((category) => category.id === categoryId && category.active)) {
      setCategoryId('')
    }
  }

  useEffect(() => {
    if (online && canManage && navigator.onLine) {
      void refresh().catch(() => setError('No se pudieron cargar los gastos'))
    }
  }, [online, canManage])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await request('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          expenseCategoryId: categoryId,
          description,
          amountPesos: Number(amount),
          expenseDate: today
        })
      })
      setCategoryId('')
      setDescription('')
      setAmount('')
      await refresh()
    } catch {
      setError('No se pudo guardar el gasto')
    }
  }

  if (!online) {
    return (
      <div>
        <PageHeader title="Gastos" />
        <Card>
          <p className="text-sm text-gray-600">Requiere conexión para registrar gastos.</p>
        </Card>
      </div>
    )
  }

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Gastos" />
        <Card>
          <p className="text-sm text-gray-600">Solo gerentes y administradores.</p>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Gastos" subtitle={`Total de hoy: $${total.toLocaleString('es-CO')}`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pb-2">Categoría</th>
                <th className="pb-2">Descripción</th>
                <th className="pb-2">Monto</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-t border-gray-100">
                  <td className="py-2">{expense.category}</td>
                  <td className="py-2">{expense.description}</td>
                  <td className="py-2">${expense.amountPesos.toLocaleString('es-CO')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <form className="space-y-3" onSubmit={onSubmit}>
            <label className="block text-sm font-medium text-gray-700">
              Categoría
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
              >
                <option value="">Selecciona una categoría</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Descripción
              <Input className="mt-1" value={description}
                onChange={(event) => setDescription(event.target.value)} required />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Monto
              <Input className="mt-1" type="number" min={1} value={amount}
                onChange={(event) => setAmount(event.target.value)} required />
            </label>
            <Button className="w-full" type="submit">Guardar</Button>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </form>
        </Card>
      </div>
    </div>
  )
}
