import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { webcrypto } from 'node:crypto'
import { afterEach } from 'vitest'

configure({ asyncUtilTimeout: 5000 })

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})
