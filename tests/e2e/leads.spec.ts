import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { clienteAdmin, crearUsuarioDePrueba } from '../rls/ayudantes'

/**
 * ===========================================================================
 * Task 9 (SP4): el recorrido completo de un lead, de punta a punta.
 * ===========================================================================
 *
 * Un comprador con cuenta abre una ficha publicada, envia el lead, y el
 * vendedor lo ve en su bandeja SIN CONTACTO; acepta, y aparece.
 *
 * Cuentas EFIMERAS con randomUUID() en el correo -- NUNCA comprador@portal.com
 * ni vendedor@portal.com. Ver el comentario de sesionVendedor() en
 * tests/rls/ayudantes.ts: seed.test.ts borra y recrea esas cuentas fijas
 * dentro de su propia prueba, y vitest/playwright corren en paralelo por
 * defecto. Una cuenta compartida entre esta suite y seed.test.ts hace que 1
 * de cada 3 corridas caiga en rojo por una carrera ajena a lo que esta prueba
 * quiere demostrar. Ya paso ademas que una verificacion manual dejo un lead
 * real de comprador@portal.com en la base -- randomUUID() y el afterAll de
 * abajo son lo que evita repetirlo.
 */

const admin = clienteAdmin()
const sufijo = randomUUID()
const PASSWORD = 'LeadE2ePrueba2026*'
const CORREO_VENDEDOR = `lead-e2e-vendedor-${sufijo}@prueba.test`
const CORREO_COMPRADOR = `lead-e2e-comprador-${sufijo}@prueba.test`
const MENSAJE = 'Me interesa esta propiedad, quisiera agendar una visita pronto.'
const SLUG = `lead-e2e-${sufijo}`

let vendedorId = ''
let compradorId = ''
let propiedadId = ''
let rutaStorage = ''
let rutaFicha = ''

test.beforeAll(async () => {
  vendedorId = await crearUsuarioDePrueba({
    correo: CORREO_VENDEDOR, password: PASSWORD, rol: 'vendedor',
  })
  compradorId = await crearUsuarioDePrueba({
    correo: CORREO_COMPRADOR, password: PASSWORD, rol: 'comprador',
  })

  const { data: barrios, error: errorBarrio } = await admin
    .from('barrios').select('id,slug').eq('activo', true).limit(1)
  if (errorBarrio || !barrios?.length) throw new Error('Falta un barrio activo de prueba')
  const barrio = barrios[0]

  const { data: propiedad, error: errorPropiedad } = await admin
    .from('propiedades')
    .insert({
      vendedor_id: vendedorId,
      barrio_id: barrio.id,
      slug: SLUG,
      titulo: 'Apartamento E2E para el recorrido completo de leads',
      descripcion: 'Descripcion de prueba, suficiente para el CHECK de longitud del campo.',
      operacion: 'venta',
      tipo_inmueble: 'apartamento',
      precio: 420000000,
    })
    .select('id')
    .single()
  if (errorPropiedad) throw errorPropiedad
  propiedadId = propiedad.id as string
  rutaFicha = `/${barrio.slug}/${SLUG}`

  // Una propiedad publicada exige al menos una imagen (trigger
  // propiedades_exigir_imagen, SP3): se sube una de verdad, igual que hace
  // catalogo-publico.spec.ts, para que la ficha renderice sin sorpresas.
  rutaStorage = `${vendedorId}/${propiedadId}/foto.webp`
  const bytes = await sharp({
    create: { width: 80, height: 60, channels: 3, background: '#5a7d6b' },
  }).webp().toBuffer()
  const { error: errorSubida } = await admin.storage
    .from('propiedades').upload(rutaStorage, bytes, { contentType: 'image/webp' })
  if (errorSubida) throw errorSubida

  const { error: errorImagen } = await admin.from('imagenes_propiedad').insert({
    propiedad_id: propiedadId, ruta_storage: rutaStorage,
    alt_text: 'Fachada de prueba E2E', orden: 0,
  })
  if (errorImagen) throw errorImagen

  const { error: errorPublicar } = await admin.from('propiedades')
    .update({ estado: 'publicada' }).eq('id', propiedadId)
  if (errorPublicar) throw errorPublicar
})

test.afterAll(async () => {
  // Limpieza explicita y no dependiente de cascadas: esta prueba se corre
  // varias veces seguidas a proposito (carreras posibles), y dejar basura de
  // una corrida no debe afectar a la siguiente ni quedarse en la base de
  // desarrollo.
  if (propiedadId) {
    await admin.from('propiedades').delete().eq('id', propiedadId)
    await admin.from('rutas_publicas_propiedad').delete().eq('propiedad_id', propiedadId)
  }
  if (rutaStorage) {
    await admin.storage.from('propiedades').remove([rutaStorage])
    await admin.from('limpieza_almacenamiento').delete().eq('ruta', rutaStorage)
  }
  if (vendedorId) await admin.auth.admin.deleteUser(vendedorId)
  if (compradorId) await admin.auth.admin.deleteUser(compradorId)
})

/**
 * Login por el formulario real -- no hay atajo por API para esta suite.
 *
 * El boton dispara un server action (`useActionState`, ver
 * src/app/(auth)/login/formulario.tsx): el click es un fetch por debajo, no
 * una navegacion de formulario clasica, y el `redirect()` del lado del
 * servidor se resuelve en el cliente DESPUES de que el click ya devolvio el
 * control. Sin esperar aqui a que la URL deje de ser /login, un `goto()`
 * inmediato del llamador puede adelantarse a la cookie de sesion: el guardia
 * de ruta lo manda de vuelta a /login y lo que sigue falla por una razon que
 * nada tiene que ver con lo que esa prueba queria comprobar. Se reprodujo en
 * vivo con la bandeja del vendedor antes de este arreglo.
 */
async function entrarComo(page: Page, correo: string, password: string) {
  await page.goto('/login')
  await page.fill('input[name="correo"]', correo)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15000 })
}

/**
 * Espera la RESPUESTA del POST del server action, no solo el evento de click
 * -- mismo patron que panel-vendedor.spec.ts, para no comprobar el DOM
 * mientras la mutacion todavia esta en vuelo.
 */
async function enviarYEsperar(page: Page, boton: string) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST'),
    page.getByRole('button', { name: boton }).click(),
  ])
}

test('comprador envia un lead; el vendedor lo ve sin contacto, y al aceptar aparece', async ({
  browser,
}) => {
  // --- El comprador, con cuenta, abre la ficha publicada y envia el lead ---
  const contextoComprador = await browser.newContext()
  const paginaComprador = await contextoComprador.newPage()

  try {
    await entrarComo(paginaComprador, CORREO_COMPRADOR, PASSWORD)
    await expect(paginaComprador).toHaveURL(/\/mi-cuenta$/, { timeout: 15000 })

    await paginaComprador.goto(rutaFicha)
    await expect(paginaComprador.getByRole('heading', { level: 1 })).toBeVisible()

    await paginaComprador.fill('input[name="telefono"]', '3009876543')
    await paginaComprador.fill('textarea[name="mensaje"]', MENSAJE)
    await enviarYEsperar(paginaComprador, 'Enviar mensaje')

    await expect(paginaComprador.getByText(/Tu mensaje se envio/i)).toBeVisible()
  } finally {
    await contextoComprador.close()
  }

  // --- El vendedor entra a su bandeja: el lead se ve, SIN contacto ---------
  const contextoVendedor = await browser.newContext()
  const paginaVendedor = await contextoVendedor.newPage()

  try {
    await entrarComo(paginaVendedor, CORREO_VENDEDOR, PASSWORD)
    await paginaVendedor.goto('/panel/leads')
    await expect(paginaVendedor.getByText(MENSAJE)).toBeVisible({ timeout: 15000 })

    // La asercion que importa: contra el HTML SERVIDO, no contra lo que se
    // vea en pantalla. Si el correo del comprador llegara al navegador y solo
    // lo escondiera el CSS, esto TIENE que fallar -- una aserción de
    // visibilidad (toBeVisible) pasaria en verde con el dato ya filtrado en
    // el HTML, y eso no es ocultar, es disimular. page.content() devuelve el
    // DOM tal como esta, sin pasar por la capa visual: es el sitio correcto
    // para comprobar "no esta", en vez de "no se ve".
    const htmlAntes = await paginaVendedor.content()
    expect(htmlAntes).not.toContain(CORREO_COMPRADOR)

    await paginaVendedor.getByRole('button', { name: 'Aceptar' }).first().click()

    // Y ahora si aparece: lo revela la base al cambiar el estado del lead
    // (RLS, tests/rls/transicion-lead.test.ts), no una interfaz que ya tenia
    // el dato y decidiera mostrarlo.
    await expect(paginaVendedor.getByText(CORREO_COMPRADOR)).toBeVisible()
  } finally {
    await contextoVendedor.close()
  }
})
