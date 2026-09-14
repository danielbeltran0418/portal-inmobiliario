import { defineConfig } from '@playwright/test'
const ORIGEN = 'http://127.0.0.1:3211'
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  use: { baseURL: ORIGEN },
  webServer: {
    // NEXT_PUBLIC_APP_URL se inyecta ANTES del build a proposito: Next inlinea
    // las NEXT_PUBLIC_* en tiempo de build.
    command: 'npx next build && npx next start -p 3211',
    url: ORIGEN,
    reuseExistingServer: false,
    timeout: 300000,
    env: { NEXT_PUBLIC_APP_URL: ORIGEN },
  },
})
