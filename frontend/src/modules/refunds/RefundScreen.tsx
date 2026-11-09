import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type SaleRow } from '../../infrastructure/database/schema'
import { refundSale, type RefundInput } from '../../application/use-cases/refunds/refund-sale'
import { Button, Card, Input, PageHeader } from '../../shared/ui'

export default function RefundScreen() {
  const navigate = useNavigate()
  const [sales, setSales] = useState<SaleRow[]>([])
  const [selected, setSelected] = useState<SaleRow | null>(null)
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState<RefundInput['method']>('CASH')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function refresh() {
    const rows = await db.sales.orderBy('createdAt').reverse().limit(50).toArray()
    setSales(rows)
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function onRefund() {
    if (!selected) {
      return
    }
    setError('')
    setMessage('')
    if (submitting) {
      return
    }
    setSubmitting(true)
    try {
      const result = await refundSale({ saleId: selected.id, reason, method })
      setMessage(`Devolución de $${result.amountPesos.toLocaleString('es-CO')} registrada`)
      setSelected(null)
      setReason('')
      setMethod('CASH')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo devolver')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Pedidos" subtitle="Historial y devoluciones offline" />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pb-2">Código</th>
                <th className="pb-2">Total</th>
                <th className="pb-2">Estado</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="border-t border-gray-100">
                  <td className="py-2 font-medium">{sale.displayCode}</td>
                  <td className="py-2">${sale.totalPesos.toLocaleString('es-CO')}</td>
                  <td className="py-2">{sale.status === 'REFUNDED' ? 'Devuelta' : 'Cobrada'}</td>
                  <td className="py-2 text-right">
                    <Button variant="ghost" disabled={sale.status === 'REFUNDED'}
                      onClick={() => { setSelected(sale); setReason('') }}>
                      Devolver
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          {selected ? (
            <div className="space-y-3">
              <h2 className="font-semibold text-gray-900">Devolver {selected.displayCode}</h2>
              <p className="text-sm text-gray-500">
                Se devuelve el total de ${selected.totalPesos.toLocaleString('es-CO')}.
              </p>
              <label className="block text-sm font-medium text-gray-700">
                Motivo
                <Input className="mt-1" value={reason}
                  onChange={(event) => setReason(event.target.value)} />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Medio de devolución
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={method}
                  onChange={(event) => setMethod(event.target.value as RefundInput['method'])}
                >
                  <option value="CASH">Efectivo</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="BREB">Bre-B</option>
                </select>
              </label>
              <div className="flex gap-2">
                <Button onClick={onRefund} disabled={submitting}>Confirmar devolución</Button>
                <Button variant="ghost" onClick={() => setSelected(null)}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Selecciona una venta para devolverla.</p>
          )}
          {message ? <p className="mt-3 text-sm text-green-700">{message}</p> : null}
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </Card>
      </div>
      <Button className="mt-4" variant="ghost" onClick={() => navigate('/sale')}>
        Volver a venta
      </Button>
    </div>
  )
}
