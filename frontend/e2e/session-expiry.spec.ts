import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('una sesión inválida vuelve a login sin repetir el refresh', async ({ page }) => {
  await login(page, 'admin', 'caja123')
  await page.evaluate(() => {
    localStorage.setItem('caja.accessToken', 'invalid')
    localStorage.setItem('caja.refreshToken', 'invalid')
  })

  let refreshes = 0
  page.on('request', (request) => {
    if (request.url().includes('/api/auth/refresh')) {
      refreshes++
    }
  })

  await page.getByRole('link', { name: /administración/i }).click()

  await expect(page.getByRole('heading', { name: /iniciar sesión/i })).toBeVisible({
    timeout: 10_000
  })
  expect(refreshes).toBe(1)
  expect(await page.evaluate(() => localStorage.getItem('caja.refreshToken'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('caja.user'))).toBeNull()
})
