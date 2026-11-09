import type { ProductRow } from '../../infrastructure/database/schema'

export interface ProductVariant {
  product: ProductRow
  label: string
}

export interface ProductFamily {
  key: string
  name: string
  categoryName: string
  variants: ProductVariant[]
}

// shortcut: las familias se infieren del nombre; mover a variantGroup/variantLabel
// en el catálogo del backend cuando el admin pueda editar variantes.
const VARIANT_PATTERNS = [
  /(?:PARA\s+)?FAMILIAR(?:\s+(?:4\s*P|PARA\s+4\s+PERSONAS|4\s+PERSONAS|PERSONAS))?/i,
  /(?:PARA\s+)?MEDIANA(?:\s+(?:2\s*P|PARA\s+2\s+PERSONAS|2\s+PERSONAS|PERSONAS))?/i,
  /(?:PARA\s+)?MEGA(?:\s+(?:6\s*P|PARA\s+6\s+PERSONAS|6\s+PERSONAS|PERSONAS))?/i,
  /PERSONAL/i,
  /JARRA/i,
  /VASO/i,
  /(?:PARA\s+)?(?:2|4|6)\s+PERSONAS/i,
  /(?:1\s*[.,]\s*5|1\s*\.?\s*LT|LITROS?)/i
]

function cleanBase(raw: string): string {
  return raw.replace(/\s+PARA$/i, '').replace(/^PARA$/i, '').trim()
}

function splitVariant(name: string): { base: string; label: string } | null {
  for (const pattern of VARIANT_PATTERNS) {
    const label = `(?:${pattern.source})`
    const withBase = name.match(new RegExp(`^(.*?)\\s+(${label})$`, 'i'))
    if (withBase) {
      return { base: cleanBase(withBase[1]), label: withBase[2].trim() }
    }
    const onlyLabel = name.match(new RegExp(`^(${label})$`, 'i'))
    if (onlyLabel) {
      return { base: '', label: onlyLabel[1].trim() }
    }
  }
  return null
}

export function buildProductFamilies(products: ProductRow[]): ProductFamily[] {
  const families = new Map<string, ProductFamily>()

  for (const product of products) {
    const variant = splitVariant(product.name)
    const base = variant ? variant.base || product.categoryName : null
    const key = base
      ? `${product.categoryName}\u0000${base.toLocaleUpperCase('es-CO')}`
      : `${product.categoryName}\u0000#${product.id}`

    const family = families.get(key)
    if (family) {
      family.variants.push({ product, label: variant?.label ?? '' })
    } else {
      families.set(key, {
        key,
        name: base ?? product.name,
        categoryName: product.categoryName,
        variants: [{ product, label: variant?.label ?? '' }]
      })
    }
  }

  const result = [...families.values()]
  for (const family of result) {
    family.variants.sort((left, right) =>
      left.product.pricePesos - right.product.pricePesos ||
      left.product.name.localeCompare(right.product.name, 'es')
    )
    if (family.variants.length === 1) {
      family.name = family.variants[0].product.name
      family.variants[0].label = ''
    }
  }
  return result
}
