import type { ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import type { Role } from '../providers/AuthProvider'
import { useAuth } from '../providers/AuthProvider'
import { Button } from '../../shared/ui'
import SyncStatus from '../../modules/sync/SyncStatus'

interface NavItem {
  to: string
  label: string
  roles?: Role[]
}

const items: NavItem[] = [
  { to: '/sale', label: 'Venta' },
  { to: '/orders', label: 'Pedidos' },
  { to: '/cash', label: 'Caja' },
  { to: '/reports', label: 'Reportes', roles: ['MANAGER', 'ADMIN'] },
  { to: '/admin', label: 'Administración', roles: ['ADMIN'] }
]

function visibleFor(item: NavItem, role: Role | undefined): boolean {
  return !item.roles || (role !== undefined && item.roles.includes(role))
}

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `rounded-lg px-3 py-2 text-sm font-medium ${
          isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
        }`}
    >
      {item.label}
    </NavLink>
  )
}

export function ShellLayout({ children }: { children?: ReactNode }) {
  const { user, lock, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="text-lg font-bold text-brand-600">Caja Karbón</span>
          <nav
            className="order-3 w-full overflow-x-auto lg:order-none lg:w-auto lg:flex-1"
            aria-label="Navegación principal"
          >
            {items.filter((item) => visibleFor(item, user?.role)).map((item) => (
              <NavItemLink key={item.to} item={item} />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SyncStatus />
            <span className="hidden text-sm text-gray-500 sm:inline">{user?.username}</span>
            <Button variant="ghost" onClick={() => { lock(); navigate('/lock') }}>
              Bloquear
            </Button>
            <Button variant="secondary" onClick={() => { logout(); navigate('/login') }}>
              Salir
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children ?? <Outlet />}</main>
    </div>
  )
}
