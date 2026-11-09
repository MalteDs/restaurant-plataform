import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'E2E_BACKEND_PORT=8081 bash ../infra/e2e-backend.sh',
      url: 'http://127.0.0.1:8081/actuator/health',
      reuseExistingServer: true,
      timeout: 180_000
    },
    {
      command: 'VITE_API_TARGET=http://127.0.0.1:8081 npm run build && VITE_API_TARGET=http://127.0.0.1:8081 npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      timeout: 120_000
    }
  ]
})
