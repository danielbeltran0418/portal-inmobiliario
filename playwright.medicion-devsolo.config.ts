import { defineConfig } from '@playwright/test'
const DEV = 'http://127.0.0.1:3210'
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  use: { baseURL: DEV },
  testIgnore: /(catalogo-publico|medicion-seo-prod)\.spec\.ts/,
  webServer: { command: 'npx next dev -p 3210', url: DEV, reuseExistingServer: false, timeout: 180000, env: { NEXT_PUBLIC_APP_URL: DEV } },
})
