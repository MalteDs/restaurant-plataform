import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type CajaDb, type SaleRow } from '../../infrastructure/database/schema'
import { saleTypeLabel } from '../printing/receipt'
import OrderDetailPanel from './OrderDetailPanel'
import {
  filterOrders,
  ordersTotal,
  presetRange,
  type OrderDatePreset,
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

const datePresets: Array<{ id: Exclude<OrderDatePreset, 'CUSTOM'>; label: string }> = [
  { id: 'TODAY', label: 'Hoy' },
  { id: 'WEEK', label: '7 días' },
  { id: 'MONTH', label: 'Mes' },
  { id: 'YEAR', label: 'Año' },
  { id: 'ALL', label: 'Todo' }
]

export default function RefundScreen({ database = db, onPrint }: RefundScreenProps) {
  const navigate = useNavigate()
  const [sales, setSales] = useState<SaleRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preset, setPreset] = useState<OrderDatePreset>('TODAY')
  const [from, setFrom] = useState<string | null>(() => presetRange('TODAY').from)
  const [to, setTo] = useState<string | null>(() => presetRange('TODAY').to)
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
  }, [from, to, status, query])

  function applyPreset(next: Exclude<OrderDatePreset, 'CUSTOM'>) {
    const range = presetRange(next)
    setPreset(next)
    setFrom(range.from)
    setTo(range.to)
  }

  const matches = filterOrders(sales, { from, to, status, query })
  const visible = matches.slice(0, limit)
  const summary = `${matches.length} ${matches.length === 1 ? 'pedido' : 'pedidos'} · $${ordersTotal(matches).toLocaleString('es-CO')}`

  return (
    <div>
      <PageHeader title="Pedidos" subtitle="Historial y devoluciones offline" />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap gap-2">
              {datePresets.map((item) => (
                <Button key={item.id} variant={preset === item.id ? 'primary' : 'ghost'}
                  aria-pressed={preset === item.id}
                  onClick={() => applyPreset(item.id)}>
                  {item.label}
                </Button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
              <label className="block text-sm font-medium text-gray-700">
                Desde
                <Input className="mt-1" type="date" value={from ?? ''}
                  onChange={(event) => {
                    setPreset('CUSTOM')
                    setFrom(event.target.value || null)
                  }} />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Hasta
                <Input className="mt-1" type="date" value={to ?? ''}
                  onChange={(event) => {
                    setPreset('CUSTOM')
                    setTo(event.target.value || null)
                  }} />
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
                </tr>
              </thead>
              <tbody>
                {visible.map((sale) => (
                  <tr key={sale.id} role="button" tabIndex={0}
                    aria-label={`Ver ${sale.displayCode}`}
                    onClick={() => setSelectedId(sale.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedId(sale.id)
                      }
                    }}
                    className={`cursor-pointer border-t border-gray-100 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none ${
                      selectedId === sale.id ? 'bg-brand-50' : ''
                    }`}>
                    <td className="py-2 font-medium">{sale.displayCode}</td>
                    <td className="py-2">{dateTime.format(new Date(sale.createdAt))}</td>
                    <td className="py-2">{saleTypeLabel(sale)}</td>
                    <td className="py-2">${sale.totalPesos.toLocaleString('es-CO')}</td>
                    <td className="py-2">
                      {sale.status === 'REFUNDED' ? 'Devuelta' : 'Cobrada'}
                    </td>
                  </tr>
                ))}
                {matches.length === 0 ? (
                  <tr>
                    <td className="py-4 text-sm text-gray-500" colSpan={5}>
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
            key={selectedId}
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
