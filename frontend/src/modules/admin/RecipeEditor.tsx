import { Button, Input } from '../../shared/ui'
import type { AdminIngredient, RecipeItemInput } from './catalog-admin'

interface Props {
  ingredients: AdminIngredient[]
  value: RecipeItemInput[]
  onChange: (recipe: RecipeItemInput[]) => void
}

export default function RecipeEditor({ ingredients, value, onChange }: Props) {
  function update(index: number, field: 'ingredientId' | 'quantity', raw: string) {
    onChange(value.map((row, rowIndex) => rowIndex === index
      ? { ...row, [field]: field === 'quantity' ? Number(raw) : raw }
      : row))
  }

  function unitOf(ingredientId: string): string {
    const ingredient = ingredients.find((item) => item.id === ingredientId)
    return ingredient?.unit === 'GRAM' ? 'gramos' : 'unidades'
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-700">Receta</legend>
      {ingredients.length === 0 ? (
        <p className="mt-1 text-xs text-gray-500">
          Crea primero un ingrediente en la pestaña Ingredientes.
        </p>
      ) : (
        <div className="mt-1 space-y-2">
          {value.map((row, index) => (
            <div key={index} className="flex items-end gap-2">
              <label className="block flex-1 text-sm font-medium text-gray-700">
                Ingrediente {index + 1}
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  value={row.ingredientId}
                  onChange={(event) => update(index, 'ingredientId', event.target.value)}
                >
                  <option value="">Selecciona</option>
                  {ingredients.map((ingredient) => (
                    <option key={ingredient.id} value={ingredient.id}>
                      {ingredient.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block w-32 text-sm font-medium text-gray-700">
                Cantidad {index + 1}
                <Input className="mt-1" type="number" min={0} step="0.001"
                  value={row.quantity === 0 ? '' : String(row.quantity)}
                  onChange={(event) => update(index, 'quantity', event.target.value)} />
                <span className="mt-1 block text-xs text-gray-500">
                  {unitOf(row.ingredientId)}
                </span>
              </label>
              <Button type="button" variant="ghost" className="px-2 py-1 text-red-600"
                aria-label={`Quitar ingrediente ${index + 1}`}
                onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}>
                ×
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost"
            onClick={() => onChange([...value, { ingredientId: '', quantity: 0 }])}>
            Agregar ingrediente
          </Button>
        </div>
      )}
    </fieldset>
  )
}
