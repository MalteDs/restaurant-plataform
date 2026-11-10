import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type CajaDb, type SaleRow } from '../../infrastructure/database/schema'
import OrderDetailPanel from './OrderDetailPanel'
import { Button, Card, PageHeader } from '../../shared/ui'

interface RefundScreenProps {
  database?: CajaDb
  onPrint?: (saleId: string) => Promise<void>
}

export default function RefundScreen({ database = db, onPrint }: RefundScreenProps) {
  const navigate = useNavigate()
  const [sales, setSales] = useState<SaleRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function refresh() {
    const rows = await database.sales.orderBy('createdAt').reverse().limit(50).toArray()
    setSales(rows)
  }

  useEffect(() => {
    void refresh()
  }, [database])

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
                    <Button variant="ghost" aria-label={`Ver ${sale.displayCode}`}
                      onClick={() => setSelectedId(sale.id)}>
                      Ver
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

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
