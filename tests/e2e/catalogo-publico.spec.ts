import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { clienteAdmin, crearUsuarioDePrueba } from '../rls/ayudantes'

const admin = clienteAdmin()
let usuario = ''
let propiedad = ''
let ruta = ''
let barrio = { id: '', nombre: '', slug: '' }
const titulo = `Casa catálogo ${randomUUID().slice(0, 8)}`

test.beforeAll(async () => {
  usuario = await crearUsuarioDePrueba({ correo: `catalogo-e2e-${randomUUID()}@prueba.test`, password: 'CatalogoE2ePrueba2026*', rol: 'vendedor' })
  const { data: barrios, error: eBarrio } = await admin.from('barrios').select('id,nombre,slug').eq('activo', true).limit(1)
  if (eBarrio || !barrios?.length) throw new Error('Falta barrio de prueba')
  barrio = barrios[0]
  const { data: p, error } = await admin.from('propiedades').insert({ vendedor_id: usuario, barrio_id: barrio.id, slug: `catalogo-e2e-${randomUUID()}`, titulo, descripcion: 'Una casa luminosa para conocer el catálogo público.', precio: 98765432.12, operacion: 'venta', tipo_inmueble: 'casa', direccion: 'DIRECCION SECRETA E2E' }).select('id').single()
  if (error) throw error
  propiedad = p.id
  ruta = `${usuario}/${propiedad}/foto.webp`
  const bytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#427166' } }).webp().toBuffer()
  const { error: eSubida } = await admin.storage.from('propiedades').upload(ruta, bytes, { contentType: 'image/webp' })
  if (eSubida) throw eSubida
  const { error: eImagen } = await admin.from('imagenes_propiedad').insert({ propiedad_id: propiedad, ruta_storage: ruta, alt_text: 'Fachada de la casa del catálogo', orden: 0 })
  if (eImagen) throw eImagen
  const { error: ePublicar } = await admin.from('propiedades').update({ estado: 'publicada' }).eq('id', propiedad)
  if (ePublicar) throw ePublicar
})
test.afterAll(async () => {
  if (propiedad) {
    await admin.from('propiedades').delete().eq('id', propiedad)
    await admin.from('rutas_publicas_propiedad').delete().eq('propiedad_id', propiedad)
  }
  if (ruta) {
    await admin.storage.from('propiedades').remove([ruta])
    await admin.from('limpieza_almacenamiento').delete().eq('ruta', ruta)
  }
  if (usuario) await admin.auth.admin.deleteUser(usuario)
})
test('visitante explora barrio, filtra, abre ficha y ve la foto sin dirección exacta', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: barrio.nombre, exact: true }).click()
  await page.getByLabel('Precio mínimo').fill('98765432.12')
  await page.getByLabel('Precio máximo').fill('98765432.12')
  await page.getByRole('button', { name: 'Filtrar', exact: true }).click()
  await expect(page).toHaveURL(/precio_min=98765432.12/)
  await page.getByRole('link', { name: new RegExp(titulo) }).click()
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible()
  const imagen = page.getByRole('img', { name: 'Fachada de la casa del catálogo' })
  await expect(imagen).toBeVisible()
  await expect.poll(() => imagen.evaluate((nodo: HTMLImageElement) => nodo.naturalWidth)).toBe(80)
  expect(await page.content()).not.toContain('DIRECCION SECRETA E2E')
  await expect(page).toHaveTitle(new RegExp(titulo))
  // La canonica se comprueba sobre el HTML SERVIDO, no sobre el DOM, y el
  // "exactamente una" va aqui: un rastreador no navega por cliente, pide la
  // URL y lee la respuesta. Esto es lo que cubre el criterio.
  const htmlServido = await (await page.request.get(page.url())).text()
  // ?? [] a proposito: sin el, cero canonicas da un "Matcher error: received
  // has value null" en vez de un "expected 0 to be 1".
  expect((htmlServido.match(/rel="canonical"/g) ?? []).length).toBe(1)
  expect(htmlServido).toContain(`<link rel="canonical" href="${page.url()}"/>`)
  // En el DOM solo se exige que ESTE la de esta ficha, sin prohibir que haya
  // otra. El motivo es que este suite corre contra `next dev` (ver
  // playwright.config.ts) y en dev Next NO retira la canonica de la pagina
  // anterior al navegar por cliente: al venir del barrio quedan las dos para
  // siempre -- comprobado con 5s de poll. En un build de produccion si la
  // reemplaza y queda una sola, tambien comprobado. Exigir aqui "exactamente
  // una" seria afirmar una propiedad del modo desarrollo, no del producto, y
  // es lo que hacia fallar esta prueba de forma intermitente: solo cuando la
  // maquina iba cargada la canonica del barrio alcanzaba a aplicarse antes
  // del salto.
  await expect(page.locator(`link[rel="canonical"][href="${page.url()}"]`)).toHaveCount(1)
  const json = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? '{}')
  expect(json['@type']).toBe('RealEstateListing')
  expect(json.offers.price).toBe(98765432.12)
  expect(JSON.stringify(json)).not.toContain('DIRECCION SECRETA E2E')
  const fichaUrl = page.url()
  const mapa = await page.request.get('/sitemap.xml')
  expect(mapa.status()).toBe(200)
  expect(await mapa.text()).toContain(fichaUrl)
  const reglas = await page.request.get('/robots.txt')
  expect(await reglas.text()).toContain('Disallow: /panel')

  // Prueba de degradación: un fallo transitorio de la base en el middleware
  // no debe tumbar el catálogo con 503, sino degradar a servir la página (200).
  const respuestaFallo = await page.request.get(fichaUrl, {
    headers: { 'x-simular-fallo-middleware': '1' },
    maxRedirects: 0,
  })
  expect(respuestaFallo.status()).not.toBe(503)
  expect(respuestaFallo.status()).toBe(200)

  const { data: otroBarrio, error: eBarrio } = await admin.from('barrios').select('id,slug').eq('activo', true).neq('id', barrio.id).limit(1).single()
  if (eBarrio) throw eBarrio
  const { error: eMover } = await admin.from('propiedades').update({ barrio_id: otroBarrio.id }).eq('id', propiedad)
  if (eMover) throw eMover
  const salto = await page.request.get(fichaUrl, { maxRedirects: 0 })
  expect(salto.status()).toBe(301)
  const nuevaUrl = new URL(salto.headers().location, fichaUrl)
  expect(nuevaUrl.pathname).toContain(`/${otroBarrio.slug}/`)
  expect((await page.request.get(nuevaUrl.href)).status()).toBe(200)
  const { error: ePausa } = await admin.from('propiedades').update({ estado: 'pausada' }).eq('id', propiedad)
  if (ePausa) throw ePausa
  expect(await (await page.request.get('/sitemap.xml')).text()).not.toContain(fichaUrl)
  expect((await page.request.get(fichaUrl, { maxRedirects: 0 })).status()).toBe(410)
  expect((await page.request.get(nuevaUrl.href)).status()).toBe(410)
  expect((await page.request.get('/barrio-inexistente/propiedad-inexistente')).status()).toBe(404)
})


