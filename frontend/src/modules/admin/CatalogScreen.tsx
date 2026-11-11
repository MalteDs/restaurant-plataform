import { useEffect, useState } from 'react'
import { request } from '../../infrastructure/api/client'
import { formatSaleDays, parseSaleDaysInput } from '../sales/sale-days'
import { Button, Card, FormError, Input, PageHeader } from '../../shared/ui'

interface Product {
  id: string
  name: string
  categoryName: string
  pricePesos: number
  costPesos: number | null
  active: boolean
  saleDays?: number[]
}

export default function CatalogScreen() {
  const online = navigator.onLine
  const [products, setProducts] = useState<Product[]>([])
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [days, setDays] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  async function refresh() {
    const snapshot = await request<{ products: Product[] }>('/api/catalog')
    setProducts(snapshot.products)
  }

  useEffect(() => {
    if (online) {
      void refresh().catch(() => setError('No se pudo cargar el catálogo'))
    }
  }, [online])

  async function save(product: Product, active = product.active) {
    setError('')
    try {
      await request(`/api/catalog/products/${product.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          pricePesos: Number(prices[product.id] ?? product.pricePesos),
          saleDays: parseSaleDaysInput(days[product.id] ?? formatSaleDays(product.saleDays)),
          active
        })
      })
      await refresh()
    } catch {
      setError('No se pudo guardar el producto')
    }
  }

  if (!online) {
    return <Card><p className="text-sm text-gray-600">Requiere conexión.</p></Card>
  }

  return (
    <div>
      <PageHeader title="Catálogo" subtitle="Precio y disponibilidad" />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="pb-2">Producto</th>
              <th className="pb-2">Categoría</th>
              <th className="pb-2">Precio</th>
              <th className="pb-2">Días</th>
              <th className="pb-2">Activo</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-t border-gray-100">
                <td className="py-2">{product.name}</td>
                <td className="py-2 text-gray-500">{product.categoryName}</td>
                <td className="py-2">
                  <Input
                    className="w-28"
                    type="number"
                    value={prices[product.id] ?? String(product.pricePesos)}
                    onChange={(event) => setPrices({ ...prices, [product.id]: event.target.value })}
                  />
                </td>
                <td className="py-2">
                  <Input
                    className="w-24"
                    placeholder="todos"
                    value={days[product.id] ?? formatSaleDays(product.saleDays)}
                    onChange={(event) => setDays({ ...days, [product.id]: event.target.value })}
                  />
                </td>
                <td className="py-2">
                  <input type="checkbox" checked={product.active}
                    onChange={(event) => void save(product, event.target.checked)} />
                </td>
                <td className="py-2 text-right">
                  <Button variant="ghost" onClick={() => void save(product)}>Guardar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-gray-500">
          Días: 1=lunes … 7=domingo, separados por coma; vacío=todos.
        </p>
        <FormError className="mt-3">{error}</FormError>
      </Card>
    </div>
  )
}
