import { expect, test } from '@playwright/test'
import { login, openShift, registerDevice, uniqueDeviceCode } from './helpers'

test('no emite errores ni warnings de consola en el flujo principal', async ({ page, context }) => {
  test.setTimeout(120_000)
  const messages: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      messages.push(`[${message.type()}] ${message.text()} @ ${message.location().url}`)
    }
  })
  page.on('pageerror', (error) => messages.push(`[pageerror] ${error.message}`))
  page.on('requestfailed', (request) => {
    messages.push(
      `[requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText}`
    )
  })

  await login(page, 'admin', 'caja123')
  await registerDevice(page, uniqueDeviceCode('X'))
  await openShift(page, 50000)

  await page.getByRole('link', { name: /^pedidos$/i }).click()
  await page.getByRole('link', { name: /^reportes$/i }).click()
  await page.getByRole('link', { name: /^administración$/i }).click()
  for (const tab of ['Catálogo', 'Usuarios', 'Dispositivos', 'Configuración']) {
    await page.getByRole('button', { name: new RegExp(`^${tab}$`, 'i') }).click()
    await page.waitForTimeout(500)
  }

  await page.getByRole('link', { name: /^venta$/i }).click()
  const checkout = page.getByRole('region', { name: 'Carrito' })
  await checkout.locator('label').filter({ hasText: 'Tipo' }).locator('select').selectOption('DINE_IN')
  await checkout.locator('input').first().fill('Mesa 4')
  await page.getByRole('button', { name: /PAPAS AMARILLA/i }).click()
  await page.getByRole('button', { name: /^Cobrar$/ }).click()
  await page.getByText(/venta ALM-/i).waitFor()
  await page.getByRole('link', { name: /^pedidos$/i }).click()
  await page.getByRole('link', { name: /^reportes$/i }).click()

  await context.setOffline(true)
  await page.getByRole('link', { name: /^venta$/i }).click()
  await page.getByRole('button', { name: /PAPAS AMARILLA/i }).click()
  await page.getByRole('button', { name: /^Cobrar$/ }).click()
  await page.getByText(/venta ALM-/i).waitFor()
  await page.getByRole('link', { name: /^reportes$/i }).click()
  await page.getByRole('link', { name: /^pedidos$/i }).click()
  await context.setOffline(false)
  await expect(page.getByText(/al día/i)).toBeVisible({ timeout: 15_000 })
  await page.goto('/recovery')
  await page.waitForTimeout(1_000)

  console.log('CONSOLE_AUDIT_START')
  for (const message of messages) {
    console.log(message)
  }
  console.log('CONSOLE_AUDIT_END')
  expect(messages, messages.join('\n')).toEqual([])
})
