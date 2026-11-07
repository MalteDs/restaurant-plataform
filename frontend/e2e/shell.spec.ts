import { expect, test } from '@playwright/test'

test('la app carga desde caché sin red y muestra login', async ({ page, context }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: /iniciar sesión/i })).toBeVisible()

  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
    timeout: 20_000
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: /iniciar sesión/i })).toBeVisible()

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByRole('heading', { name: /iniciar sesión/i })).toBeVisible()
})
