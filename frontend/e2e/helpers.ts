import { expect, type Page } from '@playwright/test'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export async function login(page: Page, username: string, password: string, pin = '1234') {
  await page.goto('/login')
  await page.getByLabel(/usuario/i).fill(username)
  await page.getByLabel(/contraseña/i).fill(password)
  await page.getByLabel(/PIN/i).fill(pin)
  await page.getByRole('button', { name: /^entrar$/i }).click()
  await expect(page.getByRole('heading', { name: /^venta$/i })).toBeVisible({ timeout: 20_000 })
  // The catalog is synced in the background after login; wait for it to be usable.
  await expect(page.getByRole('button', { name: /PAPAS AMARILLA/i }))
    .toBeVisible({ timeout: 20_000 })
}

export async function registerDevice(page: Page, code = 'A') {
  await page.getByRole('link', { name: /administración/i }).click()
  await page.getByRole('button', { name: /dispositivos/i }).click()
  await page.getByLabel(/^código$/i).fill(code)
  await page.getByLabel(/^nombre$/i).fill(`Caja ${code}`)
  await page.getByRole('button', { name: /registrar dispositivo/i }).click()
  await expect(page.getByText(/Token \(guárdalo/i)).toBeVisible({ timeout: 10_000 })
}

export async function openShift(page: Page, amount: number) {
  await page.getByRole('link', { name: /^caja$/i }).click()
  await page.getByLabel(/fondo inicial/i).fill(String(amount))
  await page.getByRole('button', { name: /abrir turno/i }).click()
  await expect(page.getByText(/turno abierto/i)).toBeVisible({ timeout: 10_000 })
}

export async function sell(page: Page, product: string) {
  await page.getByRole('link', { name: /^venta$/i }).click()
  await page.getByRole('button', { name: new RegExp(product, 'i') }).first().click()
  const add = page.getByRole('button', { name: /^agregar$/i })
  await add.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => undefined)
  if (await add.isVisible().catch(() => false)) {
    await add.click()
  }
  await page.getByRole('button', { name: /^cobrar$/i }).click()
  await expect(page.getByText(/venta ALM-A-\d+ guardada/i)).toBeVisible({ timeout: 10_000 })
}

export async function closeShift(page: Page, counted: number) {
  await page.getByRole('link', { name: /^caja$/i }).click()
  await page.getByLabel(/efectivo contado/i).fill(String(counted))
  await page.getByRole('button', { name: /cerrar turno/i }).click()
}

export async function exportPending(page: Page): Promise<string> {
  await page.goto('/recovery')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /exportar pendientes/i }).click()
  ])
  const target = join(tmpdir(), `caja-backup-${Date.now()}.jsonl`)
  await download.saveAs(target)
  return target
}

export async function restorePending(page: Page, path: string) {
  page.on('dialog', (dialog) => void dialog.accept())
  await page.goto('/recovery')
  await page.locator('input[type=file]').setInputFiles(path)
  await expect(page.getByText(/Importadas \d+/i)).toBeVisible({ timeout: 10_000 })
}
