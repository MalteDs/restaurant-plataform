import { useEffect, useState } from 'react'
import { db, type CajaDb, type RefundRow } from '../../infrastructure/database/schema'
import { refundSale, type RefundInput } from '../../application/use-cases/refunds/refund-sale'
import { bogotaDate } from '../../shared/dates'
import {
  PAYMENT_LABELS,
  loadReceiptData,
  printReceipt,
  saleTypeLabel,
  type ReceiptData
} from '../printing/receipt'
import { Button, Card, FormError, Input } from '../../shared/ui'

interface OrderDetailPanelProps {
  database?: CajaDb
  saleId: string
  onPrint?: (saleId: string) => Promise<void>
  onClose: () => void
  onChanged: () => void
}

type DetailRefund = Pick<RefundRow, 'amountPesos' | 'method' | 'reason' | 'operationalDate'>
type Detail = ReceiptData & { refund: DetailRefund | null }

const dateTime = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  dateStyle: 'short',
  timeStyle: 'short'
})

function money(value: number): string {
  return `$${value.toLocaleString('es-CO')}`
}

export default function OrderDetailPanel({
  database = db,
  saleId,
  onPrint,
  onClose,
  onChanged
}: OrderDetailPanelProps) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loadError, setLoadError] = useState('')
  const [printError, setPrintError] = useState('')
  const [refunding, setRefunding] = useState(false)
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState<RefundInput['method']>('CASH')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setLoadError('')
    void (async () => {
      try {
        const data = await loadReceiptData(database, saleId)
        const refund = (await database.refunds.where('saleId').equals(saleId).first()) ?? null
        if (!cancelled) {
          setDetail({ ...data, refund })
        }
      } catch (caught) {
        if (!cancelled) {
          setLoadError(caught instanceof Error ? caught.message : 'No se pudo cargar el pedido')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [database, saleId])

  async function onPrintSale() {
    setPrintError('')
    try {
      await (onPrint ?? ((id: string) => printReceipt(database, id)))(saleId)
    } catch {
      setPrintError('No se pudo imprimir. El pedido sigue registrado.')
    }
  }

  async function onRefund() {
    if (submitting) {
      return
    }
    setError('')
    setMessage('')
    setSubmitting(true)
    try {
      const refundReason = reason.trim()
      const refundMethod = method
      const result = await refundSale({ saleId, reason, method }, database)
      // Update from the result instead of re-reading IndexedDB, which can lag under load.
      setDetail((current) => current ? {
        ...current,
        sale: { ...current.sale, status: 'REFUNDED' },
        refund: {
          amountPesos: result.amountPesos,
          method: refundMethod,
          reason: refundReason,
          operationalDate: bogotaDate()
        }
      } : current)
      setMessage(`Devolución de ${money(result.amountPesos)} registrada`)
      setRefunding(false)
      setReason('')
      setMethod('CASH')
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo devolver')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <Card>
        <FormError>{loadError}</FormError>
      </Card>
    )
  }

  if (!detail) {
    return (
      <Card>
        <p className="text-sm text-gray-500">Cargando pedido…</p>
      </Card>
    )
  }

  const { sale, items, payments, refund, cashierName } = detail
  const orderedItems = [...items].sort((a, b) =>
    (a.lineNumber ?? Number.MAX_SAFE_INTEGER) - (b.lineNumber ?? Number.MAX_SAFE_INTEGER)
  )
  const paymentRows = payments.length > 0
    ? payments.map((payment) => ({
        key: payment.id,
        label: PAYMENT_LABELS[payment.method],
        amountPesos: payment.amountPesos
      }))
    : sale.method
      ? [{ key: 'sale-method', label: PAYMENT_LABELS[sale.method], amountPesos: sale.totalPesos }]
      : []

  return (
    <Card className="lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:max-h-[calc(100vh-var(--header-height)-2rem)] lg:overflow-y-auto">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{sale.displayCode}</h2>
            <p className={`text-sm ${sale.status === 'REFUNDED' ? 'text-red-600' : 'text-green-700'}`}>
              {sale.status === 'REFUNDED' ? 'Devuelta' : 'Cobrada'}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>

        <div className="space-y-1 text-sm text-gray-600">
          <p>Fecha: {dateTime.format(new Date(sale.createdAt))}</p>
          <p>Venta: {saleTypeLabel(sale)}</p>
          <p>Cajero: {cashierName}</p>
        </div>

        <ul className="space-y-3">
          {orderedItems.map((item) => (
            <li key={item.id} className="border-t border-gray-100 pt-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="min-w-0 break-words">
                  {item.quantity} x {item.productName}
                </span>
                <span className="whitespace-nowrap">{money(item.lineTotalPesos)}</span>
              </div>
              {item.modifiers.map((modifier, index) => (
                <div key={`${item.id}-modifier-${index}`} className="pl-3 text-xs text-gray-600">
                  + {modifier.name} {money(modifier.additionalPricePesos)}
                </div>
              ))}
              {item.components.map((component, index) => (
                <div key={`${item.id}-component-${index}`} className="pl-3 text-xs text-gray-600">
                  + {component.quantity} {component.name}
                </div>
              ))}
              {item.note ? (
                <div className="pl-3 text-xs text-gray-600">Nota: {item.note}</div>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="space-y-1 border-t border-gray-200 pt-2 text-sm">
          {sale.deliveryFeePesos > 0 ? (
            <div className="flex justify-between">
              <span>Envío</span>
              <span>{money(sale.deliveryFeePesos)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>{money(sale.totalPesos)}</span>
          </div>
        </div>

        {paymentRows.length > 0 ? (
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-gray-900">Pagos</p>
            {paymentRows.map((payment) => (
              <div key={payment.key} className="flex justify-between">
                <span>{payment.label}</span>
                <span>{money(payment.amountPesos)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {refund ? (
          <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
            <p className="font-semibold text-gray-900">Devolución</p>
            <p>Monto: {money(refund.amountPesos)}</p>
            <p>Medio: {PAYMENT_LABELS[refund.method]}</p>
            <p>Motivo: {refund.reason}</p>
            <p>Fecha: {refund.operationalDate}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => void onPrintSale()}>Imprimir comprobante</Button>
          {sale.status === 'CHARGED' && !refund ? (
            <Button onClick={() => setRefunding(true)}>Devolver</Button>
          ) : null}
        </div>

        {refunding ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Motivo
              <Input className="mt-1" value={reason}
                onChange={(event) => setReason(event.target.value)} />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Medio
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
              <Button onClick={() => void onRefund()} disabled={submitting}>
                Confirmar devolución
              </Button>
              <Button variant="ghost" onClick={() => setRefunding(false)}>Cancelar</Button>
            </div>
          </div>
        ) : null}

        {message ? <p className="text-sm text-green-700">{message}</p> : null}
        <FormError>{printError}</FormError>
        <FormError>{error}</FormError>
      </div>
    </Card>
  )
}
