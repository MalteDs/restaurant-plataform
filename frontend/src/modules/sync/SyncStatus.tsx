import { useSyncStatus, type EngineStatus } from '../../infrastructure/synchronization/sync-engine'

const labels = {
  pending: 'Pendientes',
  syncing: 'Sincronizando…',
  error: 'Error de sync',
  'up-to-date': 'Al día',
  offline: 'Sin conexión',
  unregistered: 'Sin dispositivo',
  'auth-error': 'Dispositivo inválido'
} as const

const styles = {
  pending: 'bg-amber-100 text-amber-800',
  syncing: 'bg-blue-100 text-blue-800',
  error: 'bg-red-100 text-red-800',
  'up-to-date': 'bg-green-100 text-green-800',
  offline: 'bg-gray-200 text-gray-700',
  unregistered: 'bg-amber-100 text-amber-800',
  'auth-error': 'bg-red-100 text-red-800'
} as const

const titles: Partial<Record<EngineStatus, string>> = {
  unregistered: 'Registra este dispositivo en Administración > Dispositivos para sincronizar.',
  'auth-error': 'El token del dispositivo fue rechazado. Regístralo de nuevo en Administración > Dispositivos.'
}

export default function SyncStatus() {
  const status = useSyncStatus()
  return (
    <span
      title={titles[status]}
      className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  )
}
