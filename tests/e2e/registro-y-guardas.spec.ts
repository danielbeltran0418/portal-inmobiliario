import { test, expect } from '@playwright/test'
import { ultimoEnlaceDeConfirmacion, limpiarBuzon } from './ayudantes-correo'

const CORREO = `e2e-${Date.now()}@prueba.test`
const CLAVE = 'ClaveLargaSegura2026'

test('registro, verificacion por correo, login y guardas de rol', async ({ page }) => {
  await limpiarBuzon()

  await page.goto('/registro')
  await page.fill('input[name="nombre"]', 'Vendedor E2E')
  await page.fill('input[name="correo"]', CORREO)
  await page.fill('input[name="telefono"]', '3001234567')
  await page.fill('input[name="password"]', CLAVE)
  await page.check('input[value="vendedor"]')
  await page.click('button[type="submit"]')

  await expect(page.getByRole('heading', { name: /Revisa tu correo/i })).toBeVisible()

  const enlace = await ultimoEnlaceDeConfirmacion(CORREO)
  await page.goto(enlace)

  await expect(page.getByRole('heading', { name: /Panel del vendedor/i })).toBeVisible()

  // Guarda de rol: un vendedor no entra al control del super admin.
  await page.goto('/control')
  await expect(page).toHaveURL(/\/panel/)
})

test('el usuario sin sesion es enviado al login', async ({ page }) => {
  await page.goto('/panel')
  await expect(page).toHaveURL(/\/login/)
})

test('el sexto intento fallido de login es rechazado', async ({ page }) => {
  const correo = `bloqueo-${Date.now()}@prueba.test`
  // Se acota a <main>: Next monta ademas su propio anunciador de rutas
  // (#__next-route-announcer__) con role="alert" en modo desarrollo, y un
  // getByRole('alert') sin acotar resuelve a dos elementos (violacion de
  // modo estricto) en vez de al parrafo de error de la aplicacion.
  const alerta = page.locator('main').getByRole('alert')

  for (let intento = 1; intento <= 6; intento++) {
    await page.goto('/login')
    await page.fill('input[name="correo"]', correo)
    await page.fill('input[name="password"]', 'ClaveEquivocada123')
    await page.click('button[type="submit"]')
    await expect(alerta).toBeVisible()
  }

  await expect(alerta).toContainText(/Demasiados intentos/i)
})

test('la respuesta incluye la CSP con nonce', async ({ page }) => {
  const respuesta = await page.goto('/login')
  expect(respuesta!.headers()['content-security-policy']).toContain('nonce-')
})

// Mandato de revision: la guarda de sesion redirige a /login antes de que
// exista un usuario, y esa redireccion es una respuesta HTTP propia (307).
// Una version anterior del middleware devolvia esa redireccion sin pasar
// por aplicarCabeceras, asi que la pagina de destino SI tenia las cabeceras
// pero el salto 307 no. Por eso esta prueba no navega con page.goto('/panel')
// y revisa la pagina final (eso ya lo cubre la prueba de arriba de forma
// indirecta) -- captura la respuesta del propio salto con waitForResponse
// y audita sus cabeceras antes de que el navegador la seleccione.
test('la redireccion de guarda de sesion sin usuario conserva las cabeceras de seguridad', async ({
  page,
}) => {
  const [redireccion] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/panel')),
    page.goto('/panel'),
  ])

  expect(redireccion.status()).toBe(307)

  const cabeceras = redireccion.headers()
  expect(cabeceras['content-security-policy']).toContain('nonce-')
  expect(cabeceras['x-frame-options']).toBe('DENY')
  expect(cabeceras['strict-transport-security']).toContain('max-age=31536000')
})
