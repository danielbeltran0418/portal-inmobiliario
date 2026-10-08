import { expect, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { codigoTotp } from '../compartido/totp'

/**
 * Cuentas del seed de desarrollo (supabase/seed.sql). Ya vienen con el correo
 * confirmado, asi que entran directo sin pasar por Mailpit.
 */
export const CUENTAS = [
  {
    rol: 'comprador',
    correo: 'comprador@portal.com',
    clave: 'CompradorPrueba2026*',
    enlace: 'Mi cuenta',
    ruta: '/mi-cuenta',
    encabezado: /Mi cuenta/i,
  },
  {
    rol: 'vendedor',
    correo: 'vendedor@portal.com',
    clave: 'VendedorPrueba2026*',
    enlace: 'Panel',
    ruta: '/panel',
    // Hallazgo de la Task 13 (SP3): la Task 11
    // (src/app/(vendedor)/panel/page.tsx, commit 37de7b7) reemplazo la
    // pantalla provisional ("Panel del vendedor", solo un parrafo) por el
    // listado real de propiedades, con encabezado "Mis propiedades". Esta
    // constante se quedo apuntando al texto viejo y ninguna tarea entre la
    // 11 y la 13 volvio a correr `npm run test:e2e` para notarlo (ver
    // progress.md: la ultima corrida registrada de la suite completa es de
    // la Task 3). Corregido para reflejar la pantalla real.
    encabezado: /Mis propiedades/i,
  },
  {
    rol: 'super_admin',
    correo: 'admin@portal.com',
    clave: 'AdminPrueba2026*',
    enlace: 'Control',
    ruta: '/control',
    encabezado: /Control del sistema/i,
  },
] as const

export type Cuenta = (typeof CUENTAS)[number]

export const BOTON_CERRAR_SESION = /Cerrar sesi[oó]n/i

/** La cabecera, acotada por su aria-label para no chocar con enlaces del cuerpo. */
export const cabecera = (page: Page) => page.getByRole('navigation', { name: 'Principal' })

/** Las cookies donde @supabase/ssr guarda la sesion. */
export async function cookiesDeSesion(page: Page) {
  const todas = await page.context().cookies()
  return todas.filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
}

export async function entrar(page: Page, cuenta: Cuenta) {
  if (cuenta.rol === 'super_admin') return entrarComoSuperAdmin(page)
  await page.goto('/login')
  await page.fill('input[name="correo"]', cuenta.correo)
  await page.fill('input[name="password"]', cuenta.clave)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(new RegExp(`${cuenta.ruta}$`))
}

const adminSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

/**
 * Entra como super_admin pasando por el segundo factor (hallazgo M2:
 * /control exige una sesion aal2).
 *
 * Con un super_admin EFIMERO por llamada, no con admin@portal.com: el alta
 * del factor es por usuario y varios specs entran como super_admin en
 * paralelo; sobre la misma cuenta, el alta de uno dejaria al otro con un
 * secreto que ya no vale. El secreto se lee de la propia pantalla (el texto
 * para apps que no leen QR) y el codigo se calcula como lo haria el telefono.
 */
export async function entrarComoSuperAdmin(page: Page): Promise<string> {
  const correo = `admin-e2e-${randomUUID()}@prueba.test`
  const clave = 'AdminEfimero2026*'
  const admin = adminSupabase()
  const { data, error } = await admin.auth.admin.createUser({ email: correo, password: clave, email_confirm: true })
  if (error) throw error
  const { error: errorRol } = await admin.from('perfiles').update({ rol: 'super_admin' }).eq('id', data.user.id)
  if (errorRol) throw errorRol

  await page.goto('/login')
  await page.fill('input[name="correo"]', correo)
  await page.fill('input[name="password"]', clave)
  await page.click('button[type="submit"]')

  // Con solo la contrasena, /control manda al segundo factor.
  await expect(page).toHaveURL(/\/doble-factor$/)
  await page.getByRole('button', { name: /Configurar autenticador/i }).click()
  const secreto = (await page.getByTestId('secreto-totp').textContent())?.trim()
  if (!secreto) throw new Error('La pantalla de doble factor no mostro el secreto')

  await page.fill('input[name="codigo"]', codigoTotp(secreto))
  await page.getByRole('button', { name: /^Verificar$/ }).click()
  await expect(page).toHaveURL(/\/control$/)
  return secreto
}
