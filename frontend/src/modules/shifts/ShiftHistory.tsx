import type { CajaDb, ShiftRow } from '../../infrastructure/database/schema'
import { exportShiftClosingCsv, shiftClosing } from '../../application/use-cases/reports/shift-closing'
import { Button, Card } from '../../shared/ui'

interface Props {
  database: CajaDb
  shifts: ShiftRow[]
}

export default function ShiftHistory({ database, shifts }: Props) {
  async function download(shiftId: string) {
    const closing = await shiftClosing(database, shiftId)
    if (typeof URL.createObjectURL !== 'function') {
      return
    }
    const url = URL.createObjectURL(exportShiftClosingCsv(closing))
    const link = document.createElement('a')
    link.href = url
    link.download = `cierre-${closing.operationalDate}-${closing.shiftId}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (shifts.length === 0) {
    return null
  }

  return (
    <Card className="mt-4">
      <h2 className="text-sm font-semibold text-gray-900">Turnos anteriores</h2>
      <ul className="mt-2">
        {shifts.map((shift) => (
          <li key={shift.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 py-2 text-sm">
            <div>
              <p className="font-medium">{shift.operationalDate}</p>
              <p className="text-gray-500">
                Apertura ${shift.openingCashPesos.toLocaleString('es-CO')}
                {' · '}Esperado ${(shift.expectedPesos ?? 0).toLocaleString('es-CO')}
                {' · '}Contado ${(shift.countedCashPesos ?? 0).toLocaleString('es-CO')}
                {' · '}Diferencia ${(shift.differencePesos ?? 0).toLocaleString('es-CO')}
              </p>
              {shift.closeNote ? <p className="text-gray-500">Nota: {shift.closeNote}</p> : null}
            </div>
            <Button variant="ghost" onClick={() => void download(shift.id)}>
              Descargar cierre
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
