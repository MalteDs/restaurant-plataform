import { useDeferredValue, useEffect, useState } from 'react'
import { db, type CajaDb } from '../../infrastructure/database/schema'
import { request } from '../../infrastructure/api/client'
import { syncCatalog } from '../../application/use-cases/catalog/sync-catalog'
import { formatSaleDays } from '../sales/sale-days'
import { Button, Card, FormError, Input, PageHeader } from '../../shared/ui'
import CategoryPanel from './CategoryPanel'
import ProductForm from './ProductForm'
import type {
  AdminAddon,
  AdminIngredient,
  AdminProduct,
  AdminSnapshot,
  ProductInput
} from './catalog-admin'

type Section = 'Productos' | 'Combos' | 'Adicionales' | 'Ingredientes' | 'Categorías'

const sections: Section[] = ['Productos', 'Combos', 'Adicionales', 'Ingredientes', 'Categorías']

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-CO')
}

export default function CatalogScreen({ database = db }: { database?: CajaDb }) {
  const online = navigator.onLine
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null)
  const [section, setSection] = useState<Section>('Productos')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null)
  const [newKind, setNewKind] = useState<'PRODUCT' | 'COMBO'>('PRODUCT')
  const [notice, setNotice] = useState('')
  const [syncError, setSyncError] = useState('')
  const [error, setError] = useState('')
  const deferredQuery = useDeferredValue(query)

  async function refresh() {
    setSnapshot(await request<AdminSnapshot>('/api/catalog/admin'))
  }

  async function refreshAll() {
    await refresh()
    try {
      await syncCatalog(database)
      setSyncError('')
    } catch {
      setSyncError('Los cambios se guardaron, pero la caja local se actualizará en la próxima sincronización.')
    }
  }

  useEffect(() => {
    if (online) {
      void refresh().catch(() => setError('No se pudo cargar el catálogo'))
    }
  }, [online])

  async function saveProduct(input: ProductInput) {
    setError('')
    setNotice('')
    setSyncError('')
    try {
      if (editing === 'new') {
        await request('/api/catalog/products', {
          method: 'POST',
          body: JSON.stringify(input)
        })
      } else if (editing) {
        const { kind: _kind, ...body } = input
        await request(`/api/catalog/products/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        })
      }
    } catch {
      throw new Error('No se pudo guardar el producto')
    }
    setEditing(null)
    setNotice(input.kind === 'COMBO' ? 'Combo guardado' : 'Producto guardado')
    try {
      await refreshAll()
    } catch {
      setSyncError('Producto guardado. No se pudo recargar la lista.')
    }
  }

  if (!online) {
    return <Card><p className="text-sm text-gray-600">Requiere conexión.</p></Card>
  }

  const categories = snapshot?.categories ?? []
  const products = snapshot?.products ?? []
  const addons: AdminAddon[] = snapshot?.addons ?? []
  const ingredients: AdminIngredient[] = snapshot?.ingredients ?? []
  const visibleKind = section === 'Combos' ? 'COMBO' : 'PRODUCT'
  const filtered = products.filter((product) => {
    if (product.kind !== visibleKind) {
      return false
    }
    const matchesQuery = normalize(product.name).includes(normalize(deferredQuery))
    const matchesCategory = categoryFilter === '' || product.categoryId === categoryFilter
    return matchesQuery && matchesCategory
  })

  function startNew(kind: 'PRODUCT' | 'COMBO') {
    setNotice('')
    setError('')
    setNewKind(kind)
    setEditing('new')
  }

  return (
    <div>
      <PageHeader title="Catálogo" subtitle="Productos, combos, adicionales e ingredientes" />
      {notice ? <p role="status" className="mb-3 text-sm text-green-700">{notice}</p> : null}
      {syncError ? <p role="status" className="mb-3 text-sm text-amber-700">{syncError}</p> : null}
      <FormError className="mb-3">{error}</FormError>

      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Secciones del catálogo">
        {sections.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => { setSection(item); setEditing(null) }}
            aria-current={section === item ? 'page' : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              section === item ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {item}
          </button>
        ))}
      </nav>

      {section === 'Productos' || section === 'Combos' ? (
        <div className={editing ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]' : ''}>
          <div className="space-y-4">
            <Card>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Buscar
                    <Input className="mt-1 w-56" value={query}
                      onChange={(event) => setQuery(event.target.value)} />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    Filtrar por categoría
                    <select
                      aria-label="Filtrar por categoría"
                      className="mt-1 w-48 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      value={categoryFilter}
                      onChange={(event) => setCategoryFilter(event.target.value)}
                    >
                      <option value="">Todas</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <Button onClick={() => startNew(section === 'Combos' ? 'COMBO' : 'PRODUCT')}>
                  {section === 'Combos' ? 'Nuevo combo' : 'Nuevo producto'}
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="pb-2">Producto</th>
                      <th className="pb-2">Categoría</th>
                      <th className="pb-2">Precio</th>
                      <th className="pb-2">Días</th>
                      <th className="pb-2">Adicionales</th>
                      <th className="pb-2">Estado</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((product) => (
                      <tr key={product.id} className="border-t border-gray-100">
                        <td className="py-2">
                          <span className="font-medium text-gray-900">{product.name}</span>
                          {product.kind === 'COMBO' ? (
                            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              Combo
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 text-gray-500">{product.categoryName || '—'}</td>
                        <td className="py-2">${product.pricePesos.toLocaleString('es-CO')}</td>
                        <td className="py-2 text-gray-500">{formatSaleDays(product.saleDays) || 'Todos'}</td>
                        <td className="py-2 text-gray-500">{product.addonIds?.length ?? 0}</td>
                        <td className="py-2">
                          {product.active ? (
                            <span className="text-green-700">Activo</span>
                          ) : (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              Inactivo
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <Button variant="ghost" onClick={() => {
                            setNotice('')
                            setEditing(product)
                          }}>
                            Editar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0 ? (
                <div className="mt-3 text-sm text-gray-500">
                  <p>Sin {section === 'Combos' ? 'combos' : 'productos'} con esos filtros.</p>
                  <Button variant="ghost" className="mt-2"
                    onClick={() => { setQuery(''); setCategoryFilter('') }}>
                    Limpiar filtros
                  </Button>
                </div>
              ) : null}
            </Card>

            {section === 'Productos' ? (
              <CategoryPanel categories={categories} onChanged={refreshAll} />
            ) : null}
          </div>

          {editing ? (
            <div>
              <ProductForm
                key={editing === 'new' ? `new-${newKind}` : editing.id}
                product={editing === 'new' ? null : editing}
                kind={editing === 'new' ? newKind : editing.kind}
                categories={categories}
                addons={addons}
                ingredients={ingredients}
                onSave={saveProduct}
                onCancel={() => setEditing(null)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {section === 'Adicionales' ? <Card><p className="text-sm text-gray-500">Sin adicionales.</p></Card> : null}
      {section === 'Ingredientes' ? <Card><p className="text-sm text-gray-500">Sin ingredientes.</p></Card> : null}
      {section === 'Categorías' ? <CategoryPanel categories={categories} onChanged={refreshAll} /> : null}
    </div>
  )
}
