import { test, expect } from '@playwright/test'
import sharp from 'sharp'
import { entrar, CUENTAS } from './ayudantes-sesion'

const VENDEDOR = CUENTAS[1] // vendedor@portal.com, ver ayudantes-sesion.ts

/**
 * Recorrido completo del panel del vendedor (Task 13, SP3): crear un
 * borrador, completarlo, comprobar que la lista de faltantes bloquea
 * "Publicar" hasta que haya al menos una foto, subir esa foto, publicar y
 * pausar.
 *
 * El paso que demuestra la integracion de verdad es el 5: sin comprobar que
 * "Publicar" esta deshabilitado y que aparece "Al menos una foto" ANTES de
 * subir la imagen, el resto de la prueba pasaria igual aunque
 * faltantesParaPublicar (src/lib/propiedades/completitud.ts) estuviera roto
 * y el boton nunca se deshabilitara -- el estado final ("publicada") seria el
 * mismo, solo que sin haber pasado nunca por el bloqueo que el panel le debe
 * al vendedor.
 */
/**
 * Click de un boton que dispara un server action por POST, esperando la
 * RESPUESTA (no solo el evento de click) antes de seguir. Evita comprobar el
 * DOM resultante mientras la mutacion todavia esta en vuelo.
 */
async function enviarYEsperar(page: import('@playwright/test').Page, boton: string) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST'),
    page.getByRole('button', { name: boton }).click(),
  ])
}

test('crear, completar, publicar y pausar una propiedad desde el panel', async ({ page }) => {
  const titulo = `Casa E2E panel vendedor ${Date.now()}`

  // 1. Entrar como vendedor.
  await entrar(page, VENDEDOR)

  // 2. Ir a /panel, pulsar el enlace de crear.
  await page.goto('/panel')
  await page.getByRole('link', { name: 'Publicar una propiedad' }).click()
  await expect(page).toHaveURL(/\/panel\/propiedades\/nueva$/)

  // 3. Escribir un titulo, enviar; comprobar que estamos en /panel/propiedades/<id>.
  //
  // El boton se busca por NOMBRE, no por `button[type="submit"]` a secas: en
  // esta pantalla el vendedor esta autenticado, asi que la Cabecera (Task de
  // SP1/SP2, src/componentes/cabecera.tsx) YA renderiza su propio
  // `<button type="submit">Cerrar sesión</button>`, hermano del formulario de
  // esta pagina en el DOM (los dos cuelgan de <body>, ver src/app/layout.tsx).
  // `page.click('button[type="submit"]')` toma el PRIMER boton que matchea en
  // el DOM -- el de "Cerrar sesión", que aparece antes en el HTML -- y acaba
  // cerrando la sesion del vendedor en vez de crear el borrador. Reproducido:
  // con el selector generico, el POST real invoca `cerrarSesion` (verificado
  // leyendo next-action contra server-reference-manifest.json) y la prueba
  // termina en la landing de anonimo. `getByRole` con el nombre exacto evita
  // la ambiguedad.
  await page.fill('input[name="titulo"]', titulo)
  await enviarYEsperar(page, 'Crear borrador')
  await expect(page).toHaveURL(/\/panel\/propiedades\/[0-9a-f-]{36}$/)

  // 4. Completar datos y guardar. Barrio, precio y descripcion se llenan aqui
  // a proposito: lo unico que debe faltar despues es la foto, para que el
  // paso 5 aisle justo lo que quiere demostrar.
  await page.fill('#descripcion', 'Casa amplia y luminosa, cerca de parques y colegios, ideal para una familia.')
  await page.fill('#precio', '350000000')
  await page.selectOption('#barrio_id', { index: 1 })
  await enviarYEsperar(page, 'Guardar cambios')

  // 5. Comprobar que Publicar esta DESHABILITADO y que aparece "Al menos una foto".
  //
  // Por TEXTO, no por `getByRole('listitem', ...)`: el rol ARIA `listitem`
  // tiene "name from: author" (WAI-ARIA), no "from: contents" -- a diferencia
  // de un boton o un heading, el texto de un <li> normal NO se expone como su
  // "accessible name". `getByRole('listitem', { name })` nunca lo encuentra
  // aunque el elemento este ahi (comprobado en vivo: el propio
  // `ariaSnapshot()` de Playwright SI reporta el <li>, pero `getByRole` con
  // `name` no matchea nada -- son dos calculos distintos). `getByText` busca
  // en el contenido, que es justo lo que hay que comprobar aqui.
  const botonPublicar = page.getByRole('button', { name: 'Publicar' })
  await expect(page.getByText('Al menos una foto', { exact: true })).toBeVisible()
  await expect(botonPublicar).toBeDisabled()

  // Control en la misma prueba: los otros tres faltantes de guia ya
  // quedaron resueltos por el paso 4. Sin esto, "aparece Al menos una foto"
  // seria compatible con un guardado que no hubiera guardado nada.
  await expect(page.getByText('El barrio', { exact: true })).toHaveCount(0)
  await expect(page.getByText('El precio', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/descripcion/i)).toHaveCount(0)

  // 6. Subir una imagen de prueba con su texto alternativo.
  const imagenDePrueba = await sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 180, g: 140, b: 90 } },
  }).jpeg().toBuffer()

  await page.setInputFiles('#archivo', {
    name: 'foto-e2e.jpg',
    mimeType: 'image/jpeg',
    buffer: imagenDePrueba,
  })
  await page.fill('#alt_text', 'Fachada de la casa de prueba subida por el E2E')
  await enviarYEsperar(page, 'Subir foto')

  // La foto sube: el unico faltante desaparece y Publicar deja de estar
  // deshabilitado. Esta es la mitad positiva del contraste del paso 5.
  await expect(page.getByText('Al menos una foto', { exact: true })).toHaveCount(0)
  await expect(botonPublicar).toBeEnabled()

  // 7. Publicar; comprobar el estado publicada.
  await enviarYEsperar(page, 'Publicar')
  await expect(page.getByText(/Estado: publicada/)).toBeVisible()

  // 8. Pausar; comprobar pausada.
  await enviarYEsperar(page, 'Pausar')
  await expect(page.getByText(/Estado: pausada/)).toBeVisible()
})
