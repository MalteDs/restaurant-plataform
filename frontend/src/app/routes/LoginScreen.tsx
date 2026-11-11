import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { Button, Card, FormError, Input } from '../../shared/ui'
import { ApiError } from '../../infrastructure/api/client'

export default function LoginScreen() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [locationCode, setLocationCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!/^\d{4,6}$/.test(pin)) {
      setError('El PIN debe tener entre 4 y 6 dígitos')
      return
    }
    setSubmitting(true)
    try {
      await login(username, password, locationCode || undefined, pin)
      navigate('/sale', { replace: true })
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 401
        ? 'Usuario o contraseña incorrectos'
        : 'No se pudo iniciar sesión')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Iniciar sesión</h1>
        <p className="mb-6 text-sm text-gray-500">Caja Karbón</p>
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-gray-700">
            Usuario
            <Input
              className="mt-1"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Contraseña
            <Input
              className="mt-1"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            PIN offline (4 a 6 dígitos)
            <Input
              className="mt-1 tracking-[0.4em]"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              required
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Sede (opcional)
            <Input
              className="mt-1"
              placeholder="ALM"
              value={locationCode}
              onChange={(event) => setLocationCode(event.target.value)}
            />
          </label>
          <FormError>{error}</FormError>
          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link className="text-brand-600 hover:underline" to="/recovery">
            Restaurar ventas pendientes
          </Link>
        </p>
      </Card>
    </main>
  )
}
