import { useEffect, useState } from 'react'
import { db } from '../../infrastructure/database/schema'
import { request } from '../../infrastructure/api/client'
import { dailySummary, exportSummaryCsv, type LocalSummary } from '../../application/use-cases/reports/local-summary'
import { bogotaDate } from '../../shared/dates'
import ExpensesScreen from '../expenses/ExpensesScreen'
import { Button, Card, PageHeader } from '../../shared/ui'

export default function ReportsScreen() {
  const [summary, setSummary] = useState<LocalSummary | null>(null)

  const today = bogotaDate()

  useEffect(() => {
    // Today's sales live in the local DB; the server may lag until sync finishes.
    const loadRemoteExpenses = navigator.onLine
      ? () =>
          navigator.onLine
            ? request<LocalSummary>(`/api/reports/summary?from=${today}&to=${today}`)
            : Promise.reject(new Error('sin conexión'))
      : undefined
    void dailySummary(db, today, loadRemoteExpenses).then(setSummary)
  }, [today])

  function onExport() {
    if (!summary || typeof URL.createObjectURL !== 'function') {
      return
    }
    const url = URL.createObjectURL(exportSummaryCsv(summary))
    const link = document.createElement('a')
    link.href = url
    link.download = `resumen-${today}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Reportes" subtitle="Resumen local del día" />
      {summary ? (
        <Card>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-gray-500">Ventas</p>
              <p className="text-lg font-semibold">${summary.salesPesos.toLocaleString('es-CO')}</p>
            </div>
            <div>
              <p className="text-gray-500">Neto</p>
              <p className="text-lg font-semibold">${summary.netSalesPesos.toLocaleString('es-CO')}</p>
            </div>
            <div>
              <p className="text-gray-500">Efectivo</p>
              <p className="text-lg font-semibold">${summary.cashPesos.toLocaleString('es-CO')}</p>
            </div>
            <div>
              <p className="text-gray-500">Utilidad</p>
              <p className="text-lg font-semibold">
                ${summary.operatingProfitPesos.toLocaleString('es-CO')}
              </p>
            </div>
          </div>
          <h3 className="mt-5 text-sm font-semibold text-gray-900">Por categoría</h3>
          <ul className="mt-2 text-sm">
            {summary.byCategory.map((row) => (
              <li key={row.name} className="flex justify-between border-t border-gray-100 py-1">
                <span>{row.name}</span>
                <span>${row.salesPesos.toLocaleString('es-CO')}</span>
              </li>
            ))}
          </ul>
          {summary.byExpenseCategory.length > 0 ? (
            <>
              <h3 className="mt-5 text-sm font-semibold text-gray-900">Gastos por categoría</h3>
              <ul className="mt-2 text-sm">
                {summary.byExpenseCategory.map((row) => (
                  <li key={row.name}
                    className="flex justify-between border-t border-gray-100 py-1">
                    <span>{row.name}</span>
                    <span>${row.amountPesos.toLocaleString('es-CO')}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {summary.byIngredient && summary.byIngredient.length > 0 ? (
            <>
              <h3 className="mt-5 text-sm font-semibold text-gray-900">Consumo de ingredientes</h3>
              <ul className="mt-2 text-sm">
                {summary.byIngredient.map((row) => (
                  <li key={row.name} className="flex justify-between border-t border-gray-100 py-1">
                    <span>{row.name}</span>
                    <span>
                      {row.quantity.toLocaleString('es-CO', { maximumFractionDigits: 3 })}{' '}
                      {row.unit === 'GRAM' ? 'g' : 'unidad(es)'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {summary.recipeCoveragePercent !== undefined ? (
            <>
              <p className="mt-2 text-sm text-gray-600">
                Cobertura de recetas: {summary.recipeCoveragePercent.toLocaleString('es-CO')} %
              </p>
              {summary.recipeCoveragePercent < 80 ? (
                <p role="status" className="mt-1 text-sm text-amber-700">
                  El reporte es incompleto: faltan recetas por configurar.
                </p>
              ) : null}
            </>
          ) : null}
          <Button className="mt-4" variant="ghost" onClick={onExport}>Exportar CSV</Button>
        </Card>
      ) : (
        <Card><p className="text-sm text-gray-500">Cargando resumen…</p></Card>
      )}
      <ExpensesScreen />
    </div>
  )
}
