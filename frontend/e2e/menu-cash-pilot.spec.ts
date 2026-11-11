import { expect, test } from '@playwright/test'
import {
  closeShift,
  login,
  openShift,
  registerDevice,
  sell,
  uniqueDeviceCode
} from './helpers'

test('admin crea un producto y la caja lo vende con el precio nuevo', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, 'admin', 'caja123')
  await registerDevice(page, uniqueDeviceCode('M'))
  await openShift(page, 50000)

  await page.getByRole('link', { name: /administración/i }).click()
  await page.getByRole('button', { name: /catálogo/i }).click()
  await page.getByRole('button', { name: /nuevo producto/i }).click()
  const name = `PRODUCTO E2E ${Date.now()}`
  await page.getByLabel(/^nombre$/i).fill(name)
  await page.getByLabel(/^categoría$/i).selectOption({ label: 'HAMBURGUESAS' })
  await page.getByLabel(/^precio$/i).fill('12300')
  await page.getByRole('button', { name: /guardar producto/i }).click()
  await expect(page.getByText(/producto guardado/i)).toBeVisible({ timeout: 10_000 })

  await page.getByRole('link', { name: /^venta$/i }).click()
  await page.getByLabel(/buscar producto/i).fill(name)
  await expect(page.getByRole('button', { name: new RegExp(name, 'i') })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(name, 'i') }).click()
  await page.getByLabel(/efectivo recibido/i).fill('20000')
  await expect(page.getByText(/vuelto \$7\.700/i)).toBeVisible()
  await page.getByRole('button', { name: /^cobrar$/i }).click()
  await expect(page.getByText(/venta ALM-[A-Z0-9]+-\d+ guardada/i)).toBeVisible({ timeout: 10_000 })
})

test('la caja muestra el resumen y confirma el cierre', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, 'admin', 'caja123')
  await registerDevice(page, uniqueDeviceCode('C'))
  await openShift(page, 50000)
  await sell(page, 'PAPAS AMARILLA')

  await page.getByRole('link', { name: /^caja$/i }).click()
  await expect(page.getByTestId('shift-summary')).toContainText(/ventas efectivo/i)
  await closeShift(page, { 50000: 1, 5000: 1, 2000: 1 })
  await expect(page.getByText(/turno cerrado/i)).toBeVisible()
})
