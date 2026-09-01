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

    // Contraste explicito: el primer intento es solo una credencial
    // incorrecta, no el bloqueo -- para que la diferencia con el sexto
    // quede en la prueba y no solo se infiera.
    if (intento === 1) {
      await expect(alerta).toContainText(/Correo o contrasena incorrectos/i)
    }
  }

  await expect(alerta).toContainText(/Demasiados intentos/i)
})

test('la respuesta incluye la CSP con nonce', async ({ page }) => {
  const respuesta = await page.goto('/login')
  expect(respuesta!.headers()['content-security-policy']).toContain('nonce-')
})

// Que la cabecera lleve un nonce no prueba nada por si solo: si ese nonce no
// llega a los <script> de Next, la CSP los bloquea ('strict-dynamic' hace que
// el navegador ignore 'self') y la pagina no hidrata. Esta prueba fija la
// relacion que de verdad importa: el nonce de la cabecera y el de CADA script
// son el mismo.
//
// Limitacion conocida: la suite e2e corre contra `npm run dev`, donde todo se
// renderiza dinamicamente. El otro modo de romper esto -- que `next build`
// prerenderice la pagina y `next start` sirva ese HTML sin nonce -- solo se
// reproduce en un build de produccion, y se cubre con la verificacion manual
// documentada (npm run build && npm run start).
test('el nonce de la cabecera CSP es el mismo que el de todos los scripts de Next', async ({
  page,
}) => {
  const respuesta = await page.goto('/login')
  const csp = respuesta!.headers()['content-security-policy']
  const nonceDeLaCabecera = csp.match(/'nonce-([^']+)'/)?.[1]
  expect(nonceDeLaCabecera).toBeTruthy()

  // Se auditan las etiquetas del HTML que devolvio el servidor, no el DOM ya
  // hidratado. Dos razones: el navegador borra el atributo nonce del DOM tras
  // el parseo (anti-exfiltracion con selectores CSS), y en el DOM aparecen
  // ademas scripts que el cliente inyecta en caliente (el HMR de dev) que por
  // diseno NO llevan nonce -- 'strict-dynamic' les hereda la confianza del
  // script que los inserto. Lo que tiene que llevar nonce es lo que sirve el
  // servidor.
  const html = await respuesta!.text()
  const etiquetas = html.match(/<script\b[^>]*>/g) ?? []
  expect(etiquetas.length).toBeGreaterThan(0)

  const sinNonce = etiquetas.filter((e) => !e.includes('nonce='))
  expect(sinNonce).toEqual([])

  const nonces = [...new Set(etiquetas.map((e) => e.match(/nonce="([^"]*)"/)?.[1]))]
  expect(nonces).toEqual([nonceDeLaCabecera])
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
