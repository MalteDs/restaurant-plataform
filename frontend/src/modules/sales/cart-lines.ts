import type { ModifierRow, ProductRow } from '../../infrastructure/database/schema'

const MAX_QUANTITY = 99

export interface CartLine {
  key: string
  product: ProductRow
  quantity: number
  unitPricePesos: number
  catalogUnitPricePesos: number
  overrideReason: string | null
  modifiers: ModifierRow[]
}

function sameModifiers(left: ModifierRow[], right: ModifierRow[]): boolean {
  const leftIds = left.map((modifier) => modifier.id).sort()
  const rightIds = right.map((modifier) => modifier.id).sort()
  return leftIds.length === rightIds.length &&
    leftIds.every((id, index) => id === rightIds[index])
}

export function addToCart(
  cart: CartLine[],
  product: ProductRow,
  modifiers: ModifierRow[]
): CartLine[] {
  const existing = cart.find((line) =>
    line.product.id === product.id &&
    line.overrideReason === null &&
    sameModifiers(line.modifiers, modifiers)
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
    unitPricePesos: product.pricePesos,
    catalogUnitPricePesos: product.pricePesos,
    overrideReason: null,
    modifiers
  }]
}
