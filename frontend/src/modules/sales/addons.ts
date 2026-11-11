import type { SaleAddonRow, SaleItemRow } from '../../infrastructure/database/schema'

interface LegacyModifier {
  id: string
  name: string
  additionalPricePesos: number
}

export function saleItemAddons(
  item: Pick<SaleItemRow, 'addons' | 'modifiers'>
): SaleAddonRow[] {
  if (item.addons) {
    return item.addons
  }
  return ((item.modifiers ?? []) as LegacyModifier[]).map((modifier) => ({
    id: modifier.id,
    name: modifier.name,
    pricePesos: modifier.additionalPricePesos,
    quantity: 1
  }))
}
