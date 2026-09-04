import { test, expect } from '@playwright/test'
import {
  BOTON_CERRAR_SESION,
  CUENTAS,
  cabecera,
  cookiesDeSesion,
  entrar,
} from './ayudantes-sesion'

test('sin sesion la cabecera ofrece entrar y crear cuenta, y no ofrece salir', async ({ page }) => {
  await page.goto('/')

  const nav = cabecera(page)
  await expect(nav.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')
  await expect(nav.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/registro')

  // No se puede cerrar una sesion que no existe: el control no esta.
  await expect(nav.getByRole('button', { name: BOTON_CERRAR_SESION })).toHaveCount(0)

  // Y no se filtra ningun panel a quien no ha entrado.
  for (const cuenta of CUENTAS) {
    await expect(nav.getByRole('link', { name: cuenta.enlace })).toHaveCount(0)
  }
})

for (const cuenta of CUENTAS) {
  test(`la cabecera lleva al ${cuenta.rol} a ${cuenta.ruta}`, async ({ page }) => {
    await entrar(page, cuenta)

    const nav = cabecera(page)
    await expect(nav.getByRole('link', { name: cuenta.enlace })).toHaveAttribute(
      'href',
      cuenta.ruta,
    )
    await expect(nav.getByRole('button', { name: BOTON_CERRAR_SESION })).toBeVisible()

    // Con sesion abierta desaparecen las puertas de entrada de anonimo.
    await expect(nav.getByRole('link', { name: 'Entrar' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Crear cuenta' })).toHaveCount(0)

    // El enlace no solo apunta: lleva. Un href correcto hacia una ruta que el
    // middleware rechazara no seria navegacion, seria un callejon.
    await nav.getByRole('link', { name: cuenta.enlace }).click()
    await expect(page).toHaveURL(new RegExp(`${cuenta.ruta}$`))
    await expect(page.getByRole('heading', { name: cuenta.encabezado })).toBeVisible()
  })
}

/**
 * ===========================================================================
 * LA PRUEBA DEL CIERRE DE SESION
 * ===========================================================================
 *
 * Comprobar que despues de cerrar sesion /panel redirige a /login NO PRUEBA
 * NADA POR SI SOLO: un usuario que nunca tuvo sesion tambien seria redirigido,
 * asi que un `cerrarSesion` que solo hiciera `redirect('/')` sin tocar la
 * sesion pasaria esa asercion igual de verde.
 *
 * Por eso la prueba fija primero el CASO POSITIVO -- con la sesion abierta,
 * esa misma ruta protegida SI se ve, con su encabezado -- y solo entonces
 * cierra sesion y comprueba el cambio. Lo que se afirma es la DIFERENCIA entre
 * los dos estados, que es lo unico que el cierre de sesion puede causar.
 *
 * Comprobado rompiendo la accion a proposito (redirect sin signOut): sin el
 * caso positivo delante, la prueba habria seguido verde. Con el, cae con
 * `Expected pattern: /\/login$/ / Received string: "http://127.0.0.1:3000/panel"`.
 *
 * Se comprueban las dos caras de la moneda, porque son fallos distintos:
 *   - el servidor deja de conceder la ruta protegida (la sesion ya no vale), y
 *   - la cookie desaparece del navegador (el credencial ya no esta).
 */
test('cerrar sesion destruye la sesion: la ruta protegida se veia y deja de verse', async ({
  page,
}) => {
  const cuenta = CUENTAS[1] // vendedor
  await entrar(page, cuenta)

  // --- CASO POSITIVO: con sesion, la ruta protegida SE VE -------------------
  await page.goto(cuenta.ruta)
  await expect(page).toHaveURL(new RegExp(`${cuenta.ruta}$`))
  await expect(page.getByRole('heading', { name: cuenta.encabezado })).toBeVisible()
  expect(await cookiesDeSesion(page)).not.toHaveLength(0)

  // --- Cerrar sesion --------------------------------------------------------
  // Y de paso queda fijado que viaja por POST. Un GET lo dispara un tercero
  // desde otra pagina y lo disparan solos los prefetchers; ver el comentario
  // de src/componentes/acciones-sesion.ts.
  const [peticion] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST'),
    cabecera(page).getByRole('button', { name: BOTON_CERRAR_SESION }).click(),
  ])
  expect(peticion.method()).toBe('POST')

  await expect(page).toHaveURL(/127\.0\.0\.1:3000\/$/)

  // --- Y ahora NO se ve -----------------------------------------------------
  await expect(cabecera(page).getByRole('link', { name: 'Entrar' })).toBeVisible()
  await expect(
    cabecera(page).getByRole('button', { name: BOTON_CERRAR_SESION }),
  ).toHaveCount(0)

  // La misma ruta que se veia hace tres lineas. Solo cambio una cosa entre
  // medias: el cierre de sesion.
  await page.goto(cuenta.ruta)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: /Iniciar sesión/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: cuenta.encabezado })).toHaveCount(0)

  // Y la credencial ya no esta en el navegador. Es una asercion aparte y no un
  // adorno: el servidor podria estar negando la ruta por otra razon
  // (middleware, expiracion) con la cookie todavia puesta.
  expect(await cookiesDeSesion(page)).toHaveLength(0)
})
