import { Navigate, Route, Routes } from 'react-router-dom'
import AdminScreen from './routes/AdminScreen'
import CashScreen from './routes/CashScreen'
import LoginScreen from './routes/LoginScreen'
import OrdersScreen from './routes/OrdersScreen'
import ReportsScreen from './routes/ReportsScreen'
import SaleScreen from './routes/SaleScreen'
import { RequireAuth } from './routes/RequireAuth'
import { ShellLayout } from './routes/ShellLayout'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route element={<RequireAuth />}>
        <Route element={<ShellLayout />}>
          <Route path="/sale" element={<SaleScreen />} />
          <Route path="/orders" element={<OrdersScreen />} />
          <Route path="/cash" element={<CashScreen />} />
          <Route path="/reports" element={<ReportsScreen />} />
          <Route path="/admin" element={<AdminScreen />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
