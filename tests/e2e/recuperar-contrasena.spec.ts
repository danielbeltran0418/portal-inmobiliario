import { test, expect } from '@playwright/test'
import { ultimoEnlaceDeConfirmacion, limpiarBuzon } from './ayudantes-correo'
import { BOTON_CERRAR_SESION, cabecera } from './ayudantes-sesion'

// Cuenta propia: cambiar la clave de una cuenta del seed romperia las demas
// pruebas que entran con ella.
const CORREO = `recupera-${Date.now()}@prueba.test`
const CLAVE_VIEJA = 'ClaveOriginal2026xx'
const CLAVE_NUEVA = 'ClaveRecuperada2026'

test('olvide mi contrasena: enlace por correo, clave nueva y login con ella', async ({ page }) => {
  await limpiarBuzon()

  await page.goto('/registro')
  await page.fill('input[name="nombre"]', 'Comprador Recupera')
  await page.fill('input[name="correo"]', CORREO)
  await page.fill('input[name="telefono"]', '3001234567')
  await page.fill('input[name="password"]', CLAVE_VIEJA)
  await page.check('input[value="comprador"]')
  await page.click('button[type="submit"]')
  await page.goto(await ultimoEnlaceDeConfirmacion(CORREO))
  await expect(page).toHaveURL(/\/mi-cuenta$/)
  await cabecera(page).getByRole('button', { name: BOTON_CERRAR_SESION }).click()
  await expect(cabecera(page).getByRole('link', { name: 'Entrar' })).toBeVisible()
  await limpiarBuzon()

  await page.goto('/login')
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click()
  await expect(page).toHaveURL(/\/recuperar$/)
  await page.fill('input[name="correo"]', CORREO)
  await page.click('button[type="submit"]')
  await expect(page.locator('main').getByRole('status')).toContainText(/te enviamos un enlace/i)

  await page.goto(await ultimoEnlaceDeConfirmacion(CORREO))
  await expect(page).toHaveURL(/\/restablecer$/)
  await page.fill('input[name="password"]', CLAVE_NUEVA)
  await page.fill('input[name="confirmacion"]', CLAVE_NUEVA)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/mi-cuenta$/)

  // La marca se consumio: volver a /restablecer ya no deja cambiarla.
  await page.goto('/restablecer')
  await expect(page).toHaveURL(/\/recuperar\?enlace=invalido$/)

  await page.goto('/mi-cuenta')
  await cabecera(page).getByRole('button', { name: BOTON_CERRAR_SESION }).click()
  await expect(cabecera(page).getByRole('link', { name: 'Entrar' })).toBeVisible()
  await page.goto('/login')
  await page.fill('input[name="correo"]', CORREO)
  await page.fill('input[name="password"]', CLAVE_NUEVA)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/mi-cuenta$/)
})
