import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { BOTON_CERRAR_SESION, cabecera } from './ayudantes-sesion'

// Cuenta propia: cambiar la clave de una cuenta del seed romperia las demas
// pruebas que entran con ella.
const CORREO = `recupera-${Date.now()}@prueba.test`
const CLAVE_VIEJA = 'ClaveOriginal2026xx'
const CLAVE_NUEVA = 'ClaveRecuperada2026'

// La cuenta y el enlace salen de la API de administracion, no del formulario
// de registro ni de Mailpit: el buzon es compartido y registro-y-guardas lo
// vacia al empezar, en paralelo con esta prueba, asi que el correo podia
// desaparecer antes de leerlo. generateLink devuelve el mismo token_hash que
// llevaria el correo (plantilla supabase/templates/recuperacion.html) sin
// enviarlo; el envio real lo cubre la prueba unitaria de la accion.
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

async function enlaceDeRecuperacion(): Promise<string> {
  const { data, error } = await admin().auth.admin.generateLink({ type: 'recovery', email: CORREO })
  if (error) throw error
  return `/confirmar/recuperacion?token_hash=${data.properties.hashed_token}&type=recovery`
}

test.beforeAll(async () => {
  const { error } = await admin().auth.admin.createUser({
    email: CORREO,
    password: CLAVE_VIEJA,
    email_confirm: true,
    user_metadata: { nombre: 'Comprador Recupera', telefono: '3001234567', rol_solicitado: 'comprador' },
  })
  if (error) throw error
})

test('olvide mi contrasena: enlace por correo, clave nueva y login con ella', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click()
  await expect(page).toHaveURL(/\/recuperar$/)
  await page.fill('input[name="correo"]', CORREO)
  await page.click('button[type="submit"]')
  await expect(page.locator('main').getByRole('status')).toContainText(/te enviamos un enlace/i)

  await page.goto(await enlaceDeRecuperacion())
  await expect(page).toHaveURL(/\/restablecer$/)
  await page.fill('input[name="password"]', CLAVE_NUEVA)
  await page.fill('input[name="confirmacion"]', CLAVE_NUEVA)
  // Por nombre, no button[type="submit"]: con la sesion del enlace abierta, la
  // cabecera ya trae su propio submit ("Cerrar sesion") antes que este.
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
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
