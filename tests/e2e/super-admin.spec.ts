import { test, expect } from '@playwright/test'
import { CUENTAS, entrar } from './ayudantes-sesion'

test.describe('E2E — Panel de Control y Super Admin (SP7)', () => {
  test('acceso denegado y guardas de rol para anónimo, comprador y vendedor', async ({ page }) => {
    // 1. Anónimo es redirigido a login
    await page.goto('/control')
    await expect(page).toHaveURL(/\/login/)

    // 2. Comprador no puede acceder a /control
    await entrar(page, CUENTAS[0]) // comprador
    await page.goto('/control')
    await expect(page).not.toHaveURL(/\/control/)

    // 3. Vendedor no puede acceder a /control
    await page.context().clearCookies()
    await page.goto('/login')
    await entrar(page, CUENTAS[1]) // vendedor
    await page.goto('/control')
    await expect(page).not.toHaveURL(/\/control/)
  })

  test('super_admin accede al panel de control y consulta dashboard general', async ({ page }) => {
    await entrar(page, CUENTAS[2]) // super_admin

    await page.goto('/control')
    await expect(page).toHaveURL(/\/control$/)
    await expect(page.getByRole('heading', { name: /Control del Sistema/i })).toBeVisible()

    // Comprobar tarjetas KPI
    await expect(page.getByText(/Propiedades Activas/i)).toBeVisible()
    await expect(page.getByText(/Embudo de Leads/i)).toBeVisible()
    await expect(page.getByText(/Citas Confirmadas/i)).toBeVisible()
    await expect(page.getByText(/Telemetría de Agentes IA/i)).toBeVisible()
  })

  test('super_admin navega por moderación e inspecciona ficha de propiedad', async ({ page }) => {
    await entrar(page, CUENTAS[2]) // super_admin

    await page.goto('/control/moderacion')
    await expect(page).toHaveURL(/\/control\/moderacion$/)
    await expect(page.getByRole('heading', { name: /Moderación de Publicaciones/i })).toBeVisible()

    // Tabla de moderación debe existir
    const tabla = page.locator('table')
    await expect(tabla).toBeVisible()

    // Si hay enlace a inspeccionar, navegar
    const enlaceInspeccionar = page.getByRole('link', { name: /Inspeccionar/i }).first()
    if (await enlaceInspeccionar.isVisible()) {
      await enlaceInspeccionar.click()
      await expect(page).toHaveURL(/\/control\/moderacion\/[a-f0-9-]+/)
      await expect(page.getByText(/Detalles de la Publicación/i)).toBeVisible()
      await expect(page.getByText(/Vendedor Propietario/i)).toBeVisible()
    }
  })

  test('super_admin accede a posicionamiento y formulario de nuevo acuerdo', async ({ page }) => {
    await entrar(page, CUENTAS[2]) // super_admin

    await page.goto('/control/posicionamiento')
    await expect(page).toHaveURL(/\/control\/posicionamiento$/)
    await expect(
      page.getByRole('heading', { name: /Acuerdos de Posicionamiento Pagado/i }),
    ).toBeVisible()

    // Ir al formulario de registro
    await page.getByRole('link', { name: /\+ Registrar Nuevo Acuerdo/i }).click()
    await expect(page).toHaveURL(/\/control\/posicionamiento\/nuevo$/)
    await expect(
      page.getByRole('heading', { name: /Registrar Acuerdo de Posicionamiento/i }),
    ).toBeVisible()

    await expect(page.locator('select[name="propiedad_id"]')).toBeVisible()
    await expect(page.locator('input[name="monto"]')).toBeVisible()
    await expect(page.locator('input[name="fecha_inicio"]')).toBeVisible()
    await expect(page.locator('input[name="fecha_fin"]')).toBeVisible()
  })

  test('super_admin consulta dashboard analítico de métricas e IA', async ({ page }) => {
    await entrar(page, CUENTAS[2]) // super_admin

    await page.goto('/control/metricas')
    await expect(page).toHaveURL(/\/control\/metricas$/)
    await expect(
      page.getByRole('heading', { name: /Métricas de Negocio y Telemetría de IA/i }),
    ).toBeVisible()

    await expect(page.getByText(/Embudo de Conversión de Clientes/i)).toBeVisible()
    await expect(page.getByText(/Telemetría de Agentes de IA/i)).toBeVisible()
    await expect(page.getByText(/Tokens de Inferencia/i)).toBeVisible()
  })

  test('super_admin consulta bitácora de auditoría con filtros interactivos', async ({ page }) => {
    await entrar(page, CUENTAS[2]) // super_admin

    await page.goto('/control/auditoria')
    await expect(page).toHaveURL(/\/control\/auditoria$/)
    await expect(
      page.getByRole('heading', { name: /Bitácora de Auditoría del Sistema/i }),
    ).toBeVisible()

    await expect(page.locator('input#accion')).toBeVisible()
    await expect(page.locator('input#entidad')).toBeVisible()
    await expect(page.getByRole('button', { name: /Filtrar/i })).toBeVisible()
    await expect(page.locator('table')).toBeVisible()
  })
})
