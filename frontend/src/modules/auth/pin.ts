import { db, type CajaDb } from '../../infrastructure/database/schema'

const PBKDF2_ITERATIONS = 100_000
const SALT_BYTES = 16
const KEY_BITS = 256

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits'
  ])
  const safeSalt = new Uint8Array(salt.length)
  safeSalt.set(salt)
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: safeSalt, iterations, hash: 'SHA-256' },
    key,
    KEY_BITS
  )
  return new Uint8Array(bits)
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const bits = await derive(pin, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(bits)}`
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false
  }
  let difference = 0
  for (let i = 0; i < left.length; i++) {
    difference |= left[i] ^ right[i]
  }
  return difference === 0
}

export async function verifyPin(
  userId: string,
  pin: string,
  database: CajaDb = db
): Promise<boolean> {
  const user = await database.users.get(userId)
  if (!user?.pinHash) {
    return false
  }
  const [scheme, iterations, salt, expected] = user.pinHash.split('$')
  if (scheme !== 'pbkdf2' || !iterations || !salt || !expected) {
    return false
  }
  const bits = await derive(pin, fromBase64(salt), Number(iterations))
  return sameBytes(bits, fromBase64(expected))
}
