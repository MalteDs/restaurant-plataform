import { useEffect, useState } from 'react'
import { db } from '../../infrastructure/database/schema'
import { request } from '../../infrastructure/api/client'
import { exportSummaryCsv, localSummary, type LocalSummary } from '../../application/use-cases/reports/local-summary'
import ExpensesScreen from '../expenses/ExpensesScreen'
import { Button, Card, PageHeader } from '../../shared/ui'

export default function ReportsScreen() {
  const [summary, setSummary] = useState<LocalSummary | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    async function load() {
      if (navigator.onLine) {
        try {
          // Online reports come from the server so expenses and costs match exactly.
          setSummary(await request<LocalSummary>(`/api/reports/summary?from=${today}&to=${today}`))
          return
        } catch {
          // Fall back to the local summary when the server is unreachable.
        }
      }
      setSummary(await localSummary(db, today, today))
    }
    void load()
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
          <Button className="mt-4" variant="ghost" onClick={onExport}>Exportar CSV</Button>
        </Card>
      ) : (
        <Card><p className="text-sm text-gray-500">Cargando resumen…</p></Card>
      )}
      <ExpensesScreen />
    </div>
  )
}
