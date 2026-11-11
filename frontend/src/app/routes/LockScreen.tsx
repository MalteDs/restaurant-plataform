import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { Button, Card, FormError, Input } from '../../shared/ui'

export default function LockScreen() {
  const { user, unlock } = useAuth()
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  if (!user) {
    return <Navigate to="/login" replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (await unlock(pin)) {
      navigate('/sale', { replace: true })
    } else {
      setError('PIN incorrecto o sesión expirada')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Desbloquear caja</h1>
        <p className="mb-6 text-sm text-gray-500">Ingresa el PIN de {user.username}</p>
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-gray-700">
            PIN
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
          <FormError>{error}</FormError>
          <Button className="w-full" type="submit">
            Desbloquear
          </Button>
        </form>
      </Card>
    </main>
  )
}
