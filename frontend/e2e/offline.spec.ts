import { expect, test } from '@playwright/test'
import { closeShift, exportPending, login, openShift, registerDevice, restorePending, sell, uniqueDeviceCode } from './helpers'

test('vende, cierra turno y sincroniza al volver la red', async ({ page, context }) => {
  test.setTimeout(90_000)
  await login(page, 'admin', 'caja123')
  await registerDevice(page, uniqueDeviceCode('A'))
  await openShift(page, 50000)
  await expect(page.getByText(/al día/i)).toBeVisible({ timeout: 15_000 })

  await context.setOffline(true)
  await sell(page, 'SENCILLA')
  await closeShift(page, 65000)
  await expect(page.getByTestId('difference')).toHaveText(/-1\.500/)

  await context.setOffline(false)
  await expect(page.getByText(/al día/i)).toBeVisible({ timeout: 30_000 })
})

test('recupera ventas pendientes tras perder el perfil', async ({ page, context, browser }) => {
  test.setTimeout(90_000)
  await login(page, 'admin', 'caja123')
  await registerDevice(page, uniqueDeviceCode('B'))
  await openShift(page, 50000)
  await expect(page.getByText(/al día/i)).toBeVisible({ timeout: 15_000 })

  await context.setOffline(true)
  await sell(page, 'SENCILLA')
  const backup = await exportPending(page)
  await context.close()

  const fresh = await browser.newContext()
  const restored = await fresh.newPage()
  await restorePending(restored, backup)
  await expect(restored.getByText(/Importadas [12], omitidas 0/i)).toBeVisible()
  await expect(restored.getByText(/Pendientes: [12]/i)).toBeVisible({ timeout: 10_000 })
  await fresh.close()
})
