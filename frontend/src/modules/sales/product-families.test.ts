import { describe, expect, it } from 'vitest'
import type { ProductRow } from '../../infrastructure/database/schema'
import { buildProductFamilies } from './product-families'

function product(
  id: string,
  name: string,
  categoryName: string,
  pricePesos: number
): ProductRow {
  return {
    id,
    name,
    categoryName,
    kind: 'PRODUCT',
    pricePesos,
    costPesos: null,
    sortOrder: 1,
    active: true,
    modifierGroupIds: [],
    components: []
  }
}

describe('buildProductFamilies', () => {
  it('agrupa los tamaños de salchipapas y los ordena por precio', () => {
    const families = buildProductFamilies([
      product('p1', 'SALCHI TOCI - MAIZ MEGA 6P', 'SALCHIPAPAS', 60000),
      product('p2', 'SALCHI TOCI - MAIZ PERSONAL', 'SALCHIPAPAS', 18000),
      product('p3', 'SALCHI TOCI - MAIZ FAMILIAR 4P', 'SALCHIPAPAS', 40500),
      product('p4', 'SALCHI TOCI - MAIZ MEDIANA 2P', 'SALCHIPAPAS', 24000)
    ])

    expect(families).toHaveLength(1)
    expect(families[0].name).toBe('SALCHI TOCI - MAIZ')
    expect(families[0].variants.map((variant) => variant.label)).toEqual([
      'PERSONAL',
      'MEDIANA 2P',
      'FAMILIAR 4P',
      'MEGA 6P'
    ])
    expect(families[0].variants.map((variant) => variant.product.pricePesos)).toEqual([
      18000,
      24000,
      40500,
      60000
    ])
  })

  it('agrupa llanera por tamaño aunque el nombre no repita la base', () => {
    const families = buildProductFamilies([
      product('p1', 'PERSONAL', 'LLANERA', 24000),
      product('p2', 'PARA 2 PERSONAS', 'LLANERA', 38000),
      product('p3', 'FAMILIAR 4 PERSONAS', 'LLANERA', 65000)
    ])

    expect(families).toHaveLength(1)
    expect(families[0].name).toBe('LLANERA')
    expect(families[0].variants).toHaveLength(3)
  })

  it('agrupa las picadas por tamaño', () => {
    const families = buildProductFamilies([
      product('p1', 'PARA MEDIANA 2 PERSONAS', 'PICADAS', 55000),
      product('p2', 'PARA FAMILIAR 4 PERSONAS', 'PICADAS', 75000)
    ])

    expect(families).toHaveLength(1)
    expect(families[0].name).toBe('PICADAS')
    expect(families[0].variants.map((variant) => variant.label)).toEqual([
      'MEDIANA 2 PERSONAS',
      'FAMILIAR 4 PERSONAS'
    ])
  })

  it('agrupa los jugos por presentación', () => {
    const families = buildProductFamilies([
      product('p1', 'JUGOS NATURALES EN AGUA VASO', 'BEBIDAS', 7500),
      product('p2', 'JUGOS NATURALES EN AGUA JARRA', 'BEBIDAS', 15000)
    ])

    expect(families).toHaveLength(1)
    expect(families[0].name).toBe('JUGOS NATURALES EN AGUA')
    expect(families[0].variants.map((variant) => variant.label)).toEqual(['VASO', 'JARRA'])
  })

  it('agrupa gaseosas e Hit por presentación', () => {
    const families = buildProductFamilies([
      product('p1', 'GASEOSA POSTOBON PERSONAL', 'BEBIDAS', 4500),
      product('p2', 'GASEOSA POSTOBON 1.5', 'BEBIDAS', 10000),
      product('p3', 'HIT PERSONAL', 'BEBIDAS', 4500),
      product('p4', 'HIT 1.LT', 'BEBIDAS', 8500)
    ])

    expect(families.map((family) => family.name).sort()).toEqual(['GASEOSA POSTOBON', 'HIT'])
  })

  it('deja suelto un producto sin variantes', () => {
    const families = buildProductFamilies([
      product('p1', 'SENCILLA', 'HAMBURGUESAS', 16500)
    ])

    expect(families[0].name).toBe('SENCILLA')
    expect(families[0].variants).toHaveLength(1)
  })
})
