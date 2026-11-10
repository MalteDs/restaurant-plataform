import type {
  CajaDb,
  PaymentRow,
  SaleItemRow,
  SaleRow
} from '../../infrastructure/database/schema'

export interface ReceiptData {
  sale: SaleRow
  items: SaleItemRow[]
  payments: PaymentRow[]
  cashierName: string
  locationName: string | null
  deviceCode: string | null
}

const PAYMENT_LABELS: Record<PaymentRow['method'], string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  BREB: 'Bre-B'
}

async function metaString(database: CajaDb, key: string): Promise<string | null> {
  const row = await database.meta.get(key)
  return typeof row?.value === 'string' ? row.value : null
}

export async function loadReceiptData(
  database: CajaDb,
  saleId: string
): Promise<ReceiptData> {
  const sale = await database.sales.get(saleId)
  if (!sale) {
    throw new Error('La venta no existe')
  }
  const items = await database.saleItems.where('saleId').equals(saleId).toArray()
  items.sort((a, b) =>
    (a.lineNumber ?? Number.MAX_SAFE_INTEGER) - (b.lineNumber ?? Number.MAX_SAFE_INTEGER)
  )
  const payments = await database.payments.where('saleId').equals(saleId).toArray()
  const user = await database.users.get(sale.userId)
  return {
    sale,
    items,
    payments,
    cashierName: user?.username ?? sale.userId,
    locationName: await metaString(database, 'locationName'),
    deviceCode: await metaString(database, 'devicePrefix')
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function money(value: number): string {
  return `$${value.toLocaleString('es-CO')}`
}

function typeLabel(sale: SaleRow): string {
  if (sale.type === 'COUNTER') {
    return 'Mostrador'
  }
  if (sale.type === 'DELIVERY') {
    return 'Domicilio'
  }
  if (!sale.tableLabel) {
    return 'Mesa'
  }
  return sale.tableLabel.toLowerCase().startsWith('mesa')
    ? sale.tableLabel
    : `Mesa ${sale.tableLabel}`
}

function itemsHtml(items: SaleItemRow[]): string {
  return items.map((item) => {
    const modifiers = item.modifiers.map((modifier) =>
      `<div class="modifier">+ ${escapeHtml(modifier.name)} ${money(modifier.additionalPricePesos)}</div>`
    ).join('')
    const note = item.note
      ? `<div class="note">Nota: ${escapeHtml(item.note)}</div>`
      : ''
    return `<div class="item">
      <div class="row"><span>${item.quantity} x ${escapeHtml(item.productName)}</span><span>${money(item.lineTotalPesos)}</span></div>
      ${modifiers}${note}
    </div>`
  }).join('')
}

export function buildReceiptHtml(data: ReceiptData): string {
  const { sale, items, payments, cashierName, locationName, deviceCode } = data
  const date = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(sale.createdAt))
  const paymentsHtml = payments.map((payment) =>
    `<div class="row"><span>${PAYMENT_LABELS[payment.method]}</span><span>${money(payment.amountPesos)}</span></div>`
  ).join('')
  const delivery = sale.deliveryFeePesos > 0
    ? `<div class="row"><span>Envío</span><span>${money(sale.deliveryFeePesos)}</span></div>`
    : ''

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Comprobante ${escapeHtml(sale.displayCode)}</title>
<style>
  @page { margin: 2mm; }
  * { box-sizing: border-box; }
  body { margin: 0; width: 100%; color: #000; font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; }
  h1 { margin: 0; text-align: center; font-size: 18px; letter-spacing: 1px; }
  .muted, .meta, .title { text-align: center; }
  .muted { font-size: 11px; }
  .title { margin: 6px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; }
  .meta { margin-bottom: 6px; font-size: 11px; }
  .meta div, .modifier, .note { overflow-wrap: anywhere; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  hr { margin: 6px 0; border: 0; border-top: 1px dashed #000; }
  .item { margin-bottom: 4px; }
  .modifier, .note { padding-left: 8px; font-size: 11px; }
  .total { font-size: 15px; font-weight: 700; }
  .footer { margin-top: 8px; text-align: center; font-size: 10px; }
</style>
</head>
<body>
  <h1>KARBÓN</h1>
  <div class="muted">${escapeHtml(locationName ?? deviceCode ?? '')}</div>
  <div class="title">Comprobante de venta</div>
  <div class="meta">
    <div>Código: ${escapeHtml(sale.displayCode)}</div>
    <div>Fecha: ${escapeHtml(date)}</div>
    <div>Venta: ${escapeHtml(typeLabel(sale))}</div>
    <div>Cajero: ${escapeHtml(cashierName)}</div>
  </div>
  <hr>
  ${itemsHtml(items)}
  ${delivery}
  <hr>
  <div class="row total"><span>Total</span><span>${money(sale.totalPesos)}</span></div>
  <hr>
  ${paymentsHtml}
  <div class="footer">Gracias por su visita</div>
</body>
</html>`
}
