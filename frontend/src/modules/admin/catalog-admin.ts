export interface AdminCategory {
  id: string
  name: string
  sortOrder: number
  active: boolean
}

export interface AdminModifier {
  id: string
  name: string
  additionalPricePesos: number
}

export interface AdminModifierGroup {
  id: string
  name: string
  minSelection: number
  maxSelection: number
  active: boolean
  modifiers: AdminModifier[]
}

export interface AdminProduct {
  id: string
  categoryId?: string | null
  categoryName: string
  kind: 'PRODUCT' | 'COMBO'
  name: string
  pricePesos: number
  costPesos: number | null
  sortOrder: number
  active: boolean
  saleDays?: number[]
  modifierGroupIds: string[]
  components: Array<{ productId: string; name: string; quantity: number }>
}

export interface AdminSnapshot {
  version: number
  categories: AdminCategory[]
  products: AdminProduct[]
  modifierGroups: AdminModifierGroup[]
}

export interface ProductInput {
  name: string
  categoryId: string | null
  pricePesos: number
  costPesos: number
  active: boolean
  saleDays: number[]
  modifierGroupIds: string[]
}
