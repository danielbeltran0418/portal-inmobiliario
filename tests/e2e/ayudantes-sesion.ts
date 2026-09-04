import { expect, type Page } from '@playwright/test'

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
    encabezado: /Panel del vendedor/i,
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
  await page.goto('/login')
  await page.fill('input[name="correo"]', cuenta.correo)
  await page.fill('input[name="password"]', cuenta.clave)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(new RegExp(`${cuenta.ruta}$`))
}
