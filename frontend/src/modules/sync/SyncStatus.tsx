import { useSyncStatus } from '../../infrastructure/synchronization/sync-engine'

const labels = {
  pending: 'Pendientes',
  syncing: 'Sincronizando…',
  error: 'Error de sync',
  'up-to-date': 'Al día',
  offline: 'Sin conexión'
} as const

const styles = {
  pending: 'bg-amber-100 text-amber-800',
  syncing: 'bg-blue-100 text-blue-800',
  error: 'bg-red-100 text-red-800',
  'up-to-date': 'bg-green-100 text-green-800',
  offline: 'bg-gray-200 text-gray-700'
} as const

export default function SyncStatus() {
  const status = useSyncStatus()
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}
