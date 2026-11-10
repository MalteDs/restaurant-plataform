import { Navigate, Outlet } from 'react-router-dom'
import { useAuth, type Role } from '../providers/AuthProvider'

export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/sale" replace />
  }
  return <Outlet />
}
