import { useState } from 'react'
import { PageHeader } from '../../shared/ui'
import CatalogScreen from './CatalogScreen'
import DevicesScreen from './DevicesScreen'
import SettingsScreen from './SettingsScreen'
import UsersScreen from './UsersScreen'

const tabs = ['Catálogo', 'Usuarios', 'Dispositivos', 'Configuración'] as const

export default function AdminScreen() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Catálogo')

  return (
    <div>
      <PageHeader title="Administración" subtitle="Requiere conexión" />
      <nav className="mb-4 flex gap-1">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === item ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {item}
          </button>
        ))}
      </nav>
      {tab === 'Catálogo' ? <CatalogScreen /> : null}
      {tab === 'Usuarios' ? <UsersScreen /> : null}
      {tab === 'Dispositivos' ? <DevicesScreen /> : null}
      {tab === 'Configuración' ? <SettingsScreen /> : null}
    </div>
  )
}
