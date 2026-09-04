import { test, expect } from '@playwright/test'
import { CUENTAS, entrar } from './ayudantes-sesion'

/**
 * La landing es la puerta del sitio y cambia segun quien la mire. Sin datos de
 * propiedades: el catalogo es el SP1 y no hay nada publicado todavia.
 */
test('la landing invita a registrarse al anonimo y ofrece su panel a quien ya entro', async ({
  page,
}) => {
  await page.goto('/')
  const principal = page.getByRole('main')

  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Barranquilla/i)
  await expect(principal.getByRole('link', { name: /Crear cuenta de comprador/i })).toHaveAttribute(
    'href',
    '/registro',
  )
  await expect(principal.getByRole('link', { name: /Crear cuenta de vendedor/i })).toHaveAttribute(
    'href',
    '/registro',
  )
  await expect(principal.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')

  // Ya no queda nada de la plantilla de create-next-app.
  await expect(page.getByRole('link', { name: /Deploy Now/i })).toHaveCount(0)
  await expect(page.locator('a[href*="vercel.com"]')).toHaveCount(0)
  await expect(page.locator('a[href*="nextjs.org"]')).toHaveCount(0)

  // Y no hay propiedades inventadas de relleno.
  await expect(page.locator('a[href^="/propiedades"]')).toHaveCount(0)

  // --- Con sesion abierta la invitacion se sustituye por el panel del rol ---
  const cuenta = CUENTAS[0] // comprador
  await entrar(page, cuenta)
  await page.goto('/')

  await expect(
    principal.getByRole('link', { name: new RegExp(cuenta.enlace, 'i') }),
  ).toHaveAttribute('href', cuenta.ruta)
  await expect(principal.getByRole('link', { name: /Crear cuenta de comprador/i })).toHaveCount(0)
  await expect(principal.getByRole('link', { name: /Crear cuenta de vendedor/i })).toHaveCount(0)
})
