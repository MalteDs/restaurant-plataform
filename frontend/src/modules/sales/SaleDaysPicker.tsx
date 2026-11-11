import { SALE_DAYS } from './sale-days'

interface Props {
  value: number[]
  onChange: (days: number[]) => void
}

export default function SaleDaysPicker({ value, onChange }: Props) {
  function toggle(day: number) {
    const next = value.includes(day)
      ? value.filter((item) => item !== day)
      : [...value, day]
    onChange([...new Set(next)].sort((left, right) => left - right))
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-700">Días de venta</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {SALE_DAYS.map((day) => (
          <label
            key={day.value}
            className={`inline-flex min-h-9 items-center gap-1 rounded-lg border px-2 py-1 text-sm ${
              value.includes(day.value)
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-gray-300 bg-white text-gray-700'
            }`}
          >
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={value.includes(day.value)}
              onChange={() => toggle(day.value)}
            />
            {day.label}
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="text-xs font-medium text-brand-600 hover:underline"
          onClick={() => onChange([])}>
          Todos
        </button>
        <button type="button" className="text-xs font-medium text-brand-600 hover:underline"
          onClick={() => onChange([1, 2, 3, 4])}>
          Lun-Jue
        </button>
        <button type="button" className="text-xs font-medium text-brand-600 hover:underline"
          onClick={() => onChange([5, 6, 7])}>
          Vie-Dom
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Los días sin marcar equivalen a todos los días.
      </p>
    </fieldset>
  )
}
