import { useDeferredValue, useEffect, useState } from 'react'
import { db, type CajaDb } from '../../infrastructure/database/schema'
import { request } from '../../infrastructure/api/client'
import { syncCatalog } from '../../application/use-cases/catalog/sync-catalog'
import { formatSaleDays } from '../sales/sale-days'
import { Button, Card, Input, PageHeader } from '../../shared/ui'
import CategoryPanel from './CategoryPanel'
import ProductForm from './ProductForm'
import type { AdminProduct, AdminSnapshot, ProductInput } from './catalog-admin'

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-CO')
}

export default function CatalogScreen({ database = db }: { database?: CajaDb }) {
  const online = navigator.onLine
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null)
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
          body: JSON.stringify({
            name: input.name,
            categoryId: input.categoryId,
            pricePesos: input.pricePesos,
            costPesos: input.costPesos,
            saleDays: input.saleDays,
            modifierGroupIds: input.modifierGroupIds,
            kind: 'PRODUCT'
          })
        })
      } else if (editing) {
        await request(`/api/catalog/products/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(input)
        })
      }
    } catch {
      throw new Error('No se pudo guardar el producto')
    }
    setEditing(null)
    setNotice('Producto guardado')
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
  const filtered = products.filter((product) => {
    const matchesQuery = normalize(product.name).includes(normalize(deferredQuery))
    const matchesCategory = categoryFilter === '' || product.categoryId === categoryFilter
    return matchesQuery && matchesCategory
  })

  return (
    <div>
      <PageHeader title="Catálogo" subtitle="Productos, categorías y modificadores" />
      {notice ? <p role="status" className="mb-3 text-sm text-green-700">{notice}</p> : null}
      {syncError ? <p role="status" className="mb-3 text-sm text-amber-700">{syncError}</p> : null}
      {error ? <p role="alert" className="mb-3 text-sm text-red-600">{error}</p> : null}

      <div className={editing ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]' : ''}>
        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <label className="block text-sm font-medium text-gray-700">
                  Buscar producto
                  <Input className="mt-1 w-56" value={query}
                    onChange={(event) => setQuery(event.target.value)} />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Filtrar por categoría
                  <select
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
              <Button onClick={() => { setNotice(''); setEditing('new') }}>
                Nuevo producto
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pb-2">Producto</th>
                    <th className="pb-2">Categoría</th>
                    <th className="pb-2">Precio</th>
                    <th className="pb-2">Costo</th>
                    <th className="pb-2">Días</th>
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
                      <td className="py-2">
                        {product.costPesos === null ? '—' : `$${product.costPesos.toLocaleString('es-CO')}`}
                      </td>
                      <td className="py-2 text-gray-500">{formatSaleDays(product.saleDays) || 'Todos'}</td>
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
                        <Button variant="ghost" onClick={() => { setNotice(''); setEditing(product) }}>
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
                <p>Sin productos con esos filtros.</p>
                <Button variant="ghost" className="mt-2"
                  onClick={() => { setQuery(''); setCategoryFilter('') }}>
                  Limpiar filtros
                </Button>
              </div>
            ) : null}
          </Card>

          <CategoryPanel categories={categories} onChanged={refreshAll} />
        </div>

        {editing ? (
          <div>
            <ProductForm
              key={editing === 'new' ? 'new' : editing.id}
              product={editing === 'new' ? null : editing}
              categories={categories}
              modifierGroups={snapshot?.modifierGroups ?? []}
              onSave={saveProduct}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
