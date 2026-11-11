import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  closeShift,
  login,
  openShift,
  registerDevice,
  uniqueDeviceCode
} from './helpers'

test('registra, corrige y cierra un gasto de caja con denominaciones', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, 'admin', 'caja123')
  await registerDevice(page, uniqueDeviceCode('G'))
  await openShift(page, 50000)

  await page.getByRole('link', { name: /^caja$/i }).click()
  await page.getByRole('button', { name: /registrar movimiento/i }).click()
  await page.getByLabel(/^monto$/i).fill('5000')
  await page.getByLabel(/^motivo$/i).fill('compra lechuga')
  await page.getByLabel(/es gasto/i).check()
  await page.getByRole('combobox', { name: /categoría/i }).selectOption('Fruver')
  await page.getByRole('button', { name: /guardar movimiento/i }).click()
  await expect(page.getByTestId('expected')).toContainText('45.000')

  await page.getByRole('button', { name: /editar/i }).click()
  await page.getByLabel(/^monto$/i).fill('3000')
  await page.getByRole('combobox', { name: /categoría/i }).selectOption('Aseo')
  await page.getByRole('button', { name: /guardar cambios/i }).click()
  await expect(page.getByTestId('expected')).toContainText('47.000')

  await closeShift(page, { 20000: 2, 1000: 7 })
  await expect(page.getByTestId('difference')).toContainText('0')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /descargar cierre/i }).click()
  ])
  const target = join(tmpdir(), `cierre-${Date.now()}.csv`)
  await download.saveAs(target)
  const csv = await readFile(target, 'utf8')

  expect(csv).toContain('Aseo')
  expect(csv).toContain('47.000')
  expect(csv).toContain('Denominaciones')
})
