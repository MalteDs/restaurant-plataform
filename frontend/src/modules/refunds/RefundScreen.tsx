import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type CajaDb, type SaleRow } from '../../infrastructure/database/schema'
import { bogotaDate } from '../../shared/dates'
import { saleTypeLabel } from '../printing/receipt'
import OrderDetailPanel from './OrderDetailPanel'
import {
  filterOrders,
  ordersTotal,
  type OrderStatusFilter
} from './order-list'
import { Button, Card, Input, PageHeader } from '../../shared/ui'

interface RefundScreenProps {
  database?: CajaDb
  onPrint?: (saleId: string) => Promise<void>
}

const dateTime = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  dateStyle: 'short',
  timeStyle: 'short'
})

export default function RefundScreen({ database = db, onPrint }: RefundScreenProps) {
  const navigate = useNavigate()
  const [sales, setSales] = useState<SaleRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [date, setDate] = useState<string | null>(bogotaDate())
  const [status, setStatus] = useState<OrderStatusFilter>('ALL')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(50)

  async function refresh() {
    setSales(await database.sales.toArray())
  }

  useEffect(() => {
    void refresh()
  }, [database])

  useEffect(() => {
    setLimit(50)
  }, [date, status, query])

  const matches = filterOrders(sales, { date, status, query })
  const visible = matches.slice(0, limit)
  const summary = `${matches.length} ${matches.length === 1 ? 'pedido' : 'pedidos'} · $${ordersTotal(matches).toLocaleString('es-CO')}`

  return (
    <div>
      <PageHeader title="Pedidos" subtitle="Historial y devoluciones offline" />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <div className="grid gap-3 sm:grid-cols-[160px_160px_1fr_auto] sm:items-end">
              <label className="block text-sm font-medium text-gray-700">
                Día
                <Input className="mt-1" type="date" value={date ?? ''}
                  onChange={(event) => setDate(event.target.value || null)} />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Estado
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as OrderStatusFilter)}
                >
                  <option value="ALL">Todas</option>
                  <option value="CHARGED">Cobradas</option>
                  <option value="REFUNDED">Devueltas</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Buscar
                <Input className="mt-1" placeholder="Código del pedido" value={query}
                  onChange={(event) => setQuery(event.target.value)} />
              </label>
              <Button variant="ghost" onClick={() => setDate(null)} disabled={date === null}>
                Ver todo
              </Button>
            </div>
            <p className="mt-4 text-sm font-medium text-gray-700">{summary}</p>
          </Card>

          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-2">Código</th>
                  <th className="pb-2">Fecha y hora</th>
                  <th className="pb-2">Tipo/Mesa</th>
                  <th className="pb-2">Total</th>
                  <th className="pb-2">Estado</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((sale) => (
                  <tr key={sale.id} className="border-t border-gray-100">
                    <td className="py-2 font-medium">{sale.displayCode}</td>
                    <td className="py-2">{dateTime.format(new Date(sale.createdAt))}</td>
                    <td className="py-2">{saleTypeLabel(sale)}</td>
                    <td className="py-2">${sale.totalPesos.toLocaleString('es-CO')}</td>
                    <td className="py-2">
                      {sale.status === 'REFUNDED' ? 'Devuelta' : 'Cobrada'}
                    </td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" aria-label={`Ver ${sale.displayCode}`}
                        onClick={() => setSelectedId(sale.id)}>
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))}
                {matches.length === 0 ? (
                  <tr>
                    <td className="py-4 text-sm text-gray-500" colSpan={6}>
                      No hay pedidos para este filtro.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {matches.length > visible.length ? (
              <Button className="mt-4" variant="ghost"
                onClick={() => setLimit((current) => current + 50)}>
                Cargar más
              </Button>
            ) : null}
          </Card>
        </div>

        {selectedId ? (
          <OrderDetailPanel
            database={database}
            saleId={selectedId}
            onClose={() => setSelectedId(null)}
            onChanged={refresh}
            onPrint={onPrint}
          />
        ) : (
          <Card>
            <p className="text-sm text-gray-500">Selecciona un pedido para ver el detalle.</p>
          </Card>
        )}
      </div>
      <Button className="mt-4" variant="ghost" onClick={() => navigate('/sale')}>
        Volver a venta
      </Button>
    </div>
  )
}
