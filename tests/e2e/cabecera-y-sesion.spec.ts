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

    // Ruta privada: no se indexa. La prueba unitaria fija el objeto `metadata`;
    // esto fija lo que de verdad ve un rastreador, que es la etiqueta del HTML
    // servido. Son cosas distintas: Next podria dejar de emitirla y el objeto
    // seguiria correcto.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex.*nofollow/,
    )
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

/**
 * ===========================================================================
 * EL ALCANCE DEL CIERRE: UN DISPOSITIVO, NO TODOS
 * ===========================================================================
 *
 * La prueba de arriba usa UN navegador, y con uno solo las dos opciones de
 * `scope` se ven exactamente igual: la sesion de ese navegador se cierra en
 * los dos casos. La diferencia solo existe cuando hay una segunda sesion viva,
 * y por eso hacen falta dos contextos aqui -- son dos navegadores distintos a
 * todos los efectos, con sus cookies separadas: el escritorio y el movil del
 * mismo vendedor.
 *
 * Lo que se afirma es la ASIMETRIA. Que el escritorio pierda la sesion no
 * prueba nada del alcance (eso ya lo prueba el test anterior); lo que la
 * prueba es que el movil, que no ha tocado nada, la CONSERVA. Y se fija antes
 * el caso positivo del movil -- con sesion, la ruta protegida se ve -- porque
 * si no, un movil que nunca hubiera entrado pasaria la mitad de las
 * aserciones.
 *
 * Esto cae si alguien vuelve a `signOut()` sin argumentos: el default de
 * @supabase/auth-js es `{ scope: 'global' }`, que cierra la sesion en todos
 * los dispositivos de la cuenta. Ver el bloque "Por que scope: 'local'" de
 * src/componentes/acciones-sesion.ts.
 */
test('cerrar sesion en un dispositivo no cierra la del otro', async ({ browser }) => {
  const cuenta = CUENTAS[1] // vendedor
  const escritorio = await browser.newContext()
  const movil = await browser.newContext()

  try {
    const enEscritorio = await escritorio.newPage()
    const enMovil = await movil.newPage()

    await entrar(enEscritorio, cuenta)
    await entrar(enMovil, cuenta)

    // --- CASO POSITIVO: el movil tiene sesion y ve su ruta protegida --------
    await enMovil.goto(cuenta.ruta)
    await expect(enMovil).toHaveURL(new RegExp(`${cuenta.ruta}$`))
    await expect(enMovil.getByRole('heading', { name: cuenta.encabezado })).toBeVisible()

    // --- Se cierra sesion SOLO en el escritorio -----------------------------
    await cabecera(enEscritorio).getByRole('button', { name: BOTON_CERRAR_SESION }).click()
    await expect(enEscritorio).toHaveURL(/127\.0\.0\.1:3000\/$/)

    // El escritorio, el que lo pidio, si la pierde. Sin esto la prueba pasaria
    // con un cerrarSesion que no cerrara nada en absoluto.
    await enEscritorio.goto(cuenta.ruta)
    await expect(enEscritorio).toHaveURL(/\/login$/)
    expect(await cookiesDeSesion(enEscritorio)).toHaveLength(0)

    // --- Y el movil NO. Esta es la asercion del alcance ---------------------
    // getUser() revalida contra el servidor de auth en cada peticion (ver
    // src/lib/auth/sesion.ts y el middleware), asi que esto no es una cookie
    // rancia que siga puesta: es el servidor de auth confirmando que la sesion
    // del movil sigue viva.
    await enMovil.goto(cuenta.ruta)
    await expect(enMovil).toHaveURL(new RegExp(`${cuenta.ruta}$`))
    await expect(enMovil.getByRole('heading', { name: cuenta.encabezado })).toBeVisible()
    await expect(cabecera(enMovil).getByRole('button', { name: BOTON_CERRAR_SESION })).toBeVisible()
    expect(await cookiesDeSesion(enMovil)).not.toHaveLength(0)
  } finally {
    await escritorio.close()
    await movil.close()
  }
})
