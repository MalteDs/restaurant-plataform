import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import {
  openDb,
  type CajaDb,
  type PaymentRow,
  type SaleItemRow,
  type SaleRow
} from '../../infrastructure/database/schema'
import { buildReceiptHtml, loadReceiptData, type ReceiptData } from './receipt'

const opened: CajaDb[] = []

afterEach(async () => {
  while (opened.length) {
    const db = opened.pop()!
    db.close()
    await db.delete()
  }
})

function sale(overrides: Partial<SaleRow> = {}): SaleRow {
  return {
    id: 's1',
    displayCode: 'ALM-A-000123',
    status: 'CHARGED',
    totalPesos: 23000,
    type: 'DELIVERY',
    operationalDate: '2026-11-10',
    createdAt: '2026-11-10T16:30:00.000Z',
    shiftId: 'shift-1',
    userId: 'u1',
    tableLabel: null,
    deliveryFeePesos: 5000,
    ...overrides
  }
}

function item(overrides: Partial<SaleItemRow> = {}): SaleItemRow {
  return {
    id: 'i1',
    saleId: 's1',
    productId: 'p1',
    productName: 'SENCILLA',
    categoryName: 'HAMBURGUESAS',
    quantity: 2,
    unitPricePesos: 8000,
    costPesos: null,
    lineTotalPesos: 18000,
    modifiers: [{ id: 'm1', name: 'Queso', additionalPricePesos: 1000 }],
    components: [],
    note: 'Sin cebolla',
    lineNumber: 1,
    ...overrides
  }
}

function payment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'pay1',
    saleId: 's1',
    method: 'CASH',
    amountPesos: 10000,
    ...overrides
  }
}

function data(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    sale: sale(),
    items: [item()],
    payments: [payment(), payment({ id: 'pay2', method: 'CARD', amountPesos: 13000 })],
    cashierName: 'ana',
    locationName: 'Almendros',
    deviceCode: 'ALM-A',
    ...overrides
  }
}

it('incluye el detalle, los pagos y la sede', () => {
  const html = buildReceiptHtml(data())
  for (const text of [
    'KARBÓN', 'Almendros', 'Comprobante de venta', 'ALM-A-000123',
    'SENCILLA', '2 x', '+ Queso', 'Nota: Sin cebolla', 'Envío',
    '$5.000', 'Total', '$23.000', 'Efectivo', '$10.000', 'Tarjeta', '$13.000'
  ]) {
    expect(html).toContain(text)
  }
})

it('envuelve nombres largos sin empujar el precio', () => {
  const html = buildReceiptHtml(data({
    items: [item({
      productName: 'SENCILLA CON UN NOMBRE MUY LARGO SIN ESPACIOS PARA PROBAR EL CORTE'
    })]
  }))

  expect(html).toContain('class="item-name"')
  expect(html).toMatch(/\.item-name\s*\{[^}]*overflow-wrap:\s*anywhere/)
})

it('escapa el texto dinámico', () => {
  const html = buildReceiptHtml(data({
    items: [item({ productName: '<script>alert(1)</script>' })]
  }))
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;script&gt;')
})

it('usa el código del dispositivo cuando no hay sede', () => {
  const html = buildReceiptHtml(data({ locationName: null, deviceCode: 'ALM-A' }))
  expect(html).toContain('ALM-A')
  expect(html).not.toContain('Almendros')
})

it('muestra la mesa y no imprime envío si no aplica', () => {
  const html = buildReceiptHtml(data({
    sale: sale({ type: 'DINE_IN', tableLabel: 'Mesa 4', deliveryFeePesos: 0, totalPesos: 18000 })
  }))
  expect(html).toContain('Mesa 4')
  expect(html).not.toContain('Envío')
})

it('carga la venta, las líneas en orden y el cajero', async () => {
  const db = openDb(`test-receipt-${crypto.randomUUID()}`)
  opened.push(db)
  await db.users.put({ id: 'u1', username: 'ana', role: 'CASHIER' })
  await db.sales.put(sale())
  await db.saleItems.bulkPut([
    item({ id: 'i2', productName: 'PAPAS', lineNumber: 2 }),
    item({ id: 'i1', lineNumber: 1 })
  ])
  await db.payments.bulkPut([
    { id: 'pay1', saleId: 's1', method: 'CASH', amountPesos: 10000 },
    { id: 'pay2', saleId: 's1', method: 'CARD', amountPesos: 13000 }
  ])
  await db.meta.put({ key: 'locationName', value: 'Almendros' })
  await db.meta.put({ key: 'devicePrefix', value: 'ALM-A' })

  const out = await loadReceiptData(db, 's1')

  expect(out.cashierName).toBe('ana')
  expect(out.locationName).toBe('Almendros')
  expect(out.items.map((row) => row.productName)).toEqual(['SENCILLA', 'PAPAS'])
  expect(out.payments).toHaveLength(2)
})
