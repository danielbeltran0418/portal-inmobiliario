import { defineConfig } from '@playwright/test'
const DEV = 'http://127.0.0.1:3210'
const PROD = 'http://127.0.0.1:3211'
const DIST_PROD = '.next-e2e-prod'
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  webServer: [
    { command: 'npx next dev -p 3210', url: DEV, reuseExistingServer: false, timeout: 180000, env: { NEXT_PUBLIC_APP_URL: DEV } },
    { command: 'npx next build && npx next start -p 3211', url: PROD, reuseExistingServer: false, timeout: 300000, env: { NEXT_PUBLIC_APP_URL: PROD, NEXT_DIST_DIR: DIST_PROD } },
  ],
  projects: [
    { name: 'dev', testIgnore: /(catalogo-publico|medicion-seo-prod)\.spec\.ts/, use: { baseURL: DEV } },
    { name: 'seo-prod', testMatch: /medicion-seo-prod\.spec\.ts/, use: { baseURL: PROD } },
  ],
})
