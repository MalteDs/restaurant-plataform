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

export interface RecipeItemInput {
  ingredientId: string
  quantity: number
}

export interface DayPriceInput {
  weekday: number
  pricePesos: number
}

export interface AdminAddon {
  id: string
  name: string
  pricePesos: number
  active: boolean
  recipe: RecipeItemInput[]
}

export interface AdminIngredient {
  id: string
  name: string
  unit: 'UNIT' | 'GRAM'
  wastePercent: number
  active: boolean
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
  addonIds: string[]
  dayPrices: DayPriceInput[]
  recipe: RecipeItemInput[]
  modifierGroupIds: string[]
  components: Array<{ productId: string; name: string; quantity: number }>
}

export interface AdminSnapshot {
  version: number
  categories: AdminCategory[]
  products: AdminProduct[]
  addons: AdminAddon[]
  ingredients: AdminIngredient[]
  modifierGroups: AdminModifierGroup[]
}

export interface ProductInput {
  name: string
  categoryId: string | null
  pricePesos: number
  costPesos: number
  active: boolean
  saleDays: number[]
  addonIds: string[]
  dayPrices: DayPriceInput[]
  recipe: RecipeItemInput[]
  components: Array<{ productId: string; quantity: number }>
  kind: 'PRODUCT' | 'COMBO'
}
