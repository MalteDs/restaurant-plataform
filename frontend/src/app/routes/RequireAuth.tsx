import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'

export function RequireAuth() {
  const { user, locked } = useAuth()
  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (locked) {
    return <Navigate to="/lock" replace />
  }
  return <Outlet />
}
