import { expect, test } from '@playwright/test'
import {
  confirmAddIfPresent,
  login,
  openShift,
  registerDevice,
  sell,
  uniqueDeviceCode
} from './helpers'

test('agrupa variantes, elige tamaño y elimina del carrito', async ({ page, context }) => {
  test.setTimeout(90_000)
  await login(page, 'admin', 'caja123')
  await registerDevice(page, uniqueDeviceCode('C'))
  await openShift(page, 50000)
  await expect(page.getByText(/al día/i)).toBeVisible({ timeout: 15_000 })
  await context.setOffline(true)

  await page.getByRole('link', { name: /^venta$/i }).click()
  const family = page.getByRole('button', { name: /SALCHI TOCI - MAIZ/i })
  await expect(family).toContainText(/desde \$18\.000/i)
  await family.click()
  await page.getByRole('button', { name: /^MEDIANA 2P/ }).click()
  await confirmAddIfPresent(page)

  await expect(page.getByText('SALCHI TOCI - MAIZ MEDIANA 2P', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: /Eliminar SALCHI TOCI - MAIZ MEDIANA 2P/i })
    .click()
  await expect(page.getByText('SALCHI TOCI - MAIZ MEDIANA 2P', { exact: true })).toBeHidden()
  await expect(page.getByText(/Agrega productos del catálogo/i)).toBeVisible()

  await family.click()
  await page.getByRole('button', { name: /^MEDIANA 2P/ }).click()
  await confirmAddIfPresent(page)
  await page.getByRole('button', { name: /^Cobrar$/ }).click()
  await expect(page.getByText(/venta ALM-[A-Z0-9]+-\d+ guardada/i)).toBeVisible({
    timeout: 10_000
  })

  await page.getByRole('link', { name: /^pedidos$/i }).click()
  await expect(page.getByText(/ALM-[A-Z0-9]+-\d+/).first()).toBeVisible()
})

test('el reporte del día suma todas las ventas locales', async ({ page, context }) => {
  test.setTimeout(90_000)
  await login(page, 'admin', 'caja123')
  await registerDevice(page, uniqueDeviceCode('D'))
  await openShift(page, 50000)
  await expect(page.getByText(/al día/i)).toBeVisible({ timeout: 15_000 })
  await context.setOffline(true)

  await sell(page, 'PAPAS AMARILLA')
  await sell(page, 'PAPAS AMARILLA')

  await page.getByRole('link', { name: /^reportes$/i }).click()
  const salesTotal = page.getByText('Ventas', { exact: true }).locator('..')
  await expect(salesTotal).toContainText('$14.000')
})

test('en móvil el encabezado queda fijo y el carrito siempre está accesible', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'admin', 'caja123')
  await registerDevice(page, uniqueDeviceCode('E'))
  await openShift(page, 50000)

  await page.getByRole('link', { name: /^venta$/i }).click()
  await page.getByRole('button', { name: /PAPAS AMARILLA/i }).click()

  await expect(page.locator('header').first()).toHaveCSS('position', 'sticky')
  const cartBar = page.getByRole('button', { name: /Carrito \(1\)/ })
  await expect(cartBar).toBeVisible()
  await expect(page.getByRole('button', { name: /^Cobrar$/ })).toBeHidden()

  await cartBar.click()
  await expect(page.getByRole('button', { name: /^Cobrar$/ })).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Carrito' }).getByText('PAPAS AMARILLA', { exact: true })
  ).toBeVisible()
})

test('cobra con pago dividido y el arqueo solo suma efectivo', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, 'admin', 'caja123')
  await registerDevice(page, uniqueDeviceCode('F'))
  await openShift(page, 50000)
  await expect(page.getByText(/al día/i)).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: /^venta$/i }).click()
  await page.getByRole('button', { name: /PAPAS AMARILLA/i }).click()
  await page.getByRole('button', { name: /dividir pago/i }).click()

  await page.getByLabel(/monto del pago 1/i).fill('4000')
  await page.getByLabel(/medio del nuevo pago/i).selectOption('CARD')
  await page.getByLabel(/monto del nuevo pago/i).fill('3000')
  await page.getByRole('button', { name: /agregar pago/i }).click()
  await expect(page.getByText(/restante \$0/i)).toBeVisible()
  await page.getByRole('button', { name: /^cobrar$/i }).click()
  await expect(page.getByText(/venta ALM-[A-Z0-9]+-\d+ guardada/i)).toBeVisible({
    timeout: 10_000
  })

  await page.getByRole('link', { name: /^caja$/i }).click()
  await expect(page.getByTestId('expected')).toContainText('54.000')
})
