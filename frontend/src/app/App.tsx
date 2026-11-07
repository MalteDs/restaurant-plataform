import { Navigate, Route, Routes } from 'react-router-dom'
import AdminScreen from '../modules/admin/AdminScreen'
import CashScreen from '../modules/shifts/CashScreen'
import LockScreen from './routes/LockScreen'
import LoginScreen from './routes/LoginScreen'
import RefundScreen from '../modules/refunds/RefundScreen'
import ReportsScreen from '../modules/reports/ReportsScreen'
import SaleScreen from '../modules/sales/SaleScreen'
import { RequireAuth } from './routes/RequireAuth'
import { ShellLayout } from './routes/ShellLayout'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/lock" element={<LockScreen />} />
      <Route element={<RequireAuth />}>
        <Route element={<ShellLayout />}>
          <Route path="/sale" element={<SaleScreen />} />
          <Route path="/orders" element={<RefundScreen />} />
          <Route path="/cash" element={<CashScreen />} />
          <Route path="/reports" element={<ReportsScreen />} />
          <Route path="/admin" element={<AdminScreen />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
