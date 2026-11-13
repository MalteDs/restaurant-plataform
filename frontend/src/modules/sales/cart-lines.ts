import type { ProductRow, SaleAddonRow } from '../../infrastructure/database/schema'

const MAX_QUANTITY = 99

export interface CartLine {
  key: string
  product: ProductRow
  quantity: number
  unitPricePesos: number
  catalogUnitPricePesos: number
  overrideReason: string | null
  addons: SaleAddonRow[]
}

function sameAddons(left: SaleAddonRow[], right: SaleAddonRow[]): boolean {
  const ordered = (rows: SaleAddonRow[]) =>
    [...rows].sort((a, b) => a.id.localeCompare(b.id))
  const leftRows = ordered(left)
  const rightRows = ordered(right)
  return leftRows.length === rightRows.length &&
    leftRows.every((row, index) =>
      row.id === rightRows[index].id && row.quantity === rightRows[index].quantity)
}

export function addToCart(
  cart: CartLine[],
  product: ProductRow,
  addons: SaleAddonRow[],
  unitPricePesos: number
): CartLine[] {
  const existing = cart.find((line) =>
    line.product.id === product.id &&
    line.overrideReason === null &&
    sameAddons(line.addons, addons)
  )
  if (existing) {
    return cart.map((line) => line.key === existing.key
      ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + 1) }
      : line)
  }
  return [...cart, {
    key: crypto.randomUUID(),
    product,
    quantity: 1,
    unitPricePesos,
    catalogUnitPricePesos: unitPricePesos,
    overrideReason: null,
    addons
  }]
}
