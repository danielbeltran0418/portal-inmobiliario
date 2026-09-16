import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { clienteAdmin, crearUsuarioDePrueba } from '../rls/ayudantes'

const admin = clienteAdmin()
const sufijo = randomUUID()
const PASSWORD = 'IaE2ePrueba2026*'
const CORREO_VENDEDOR = `ia-e2e-vendedor-${sufijo}@prueba.test`
const CORREO_COMPRADOR = `ia-e2e-comprador-${sufijo}@prueba.test`
const MENSAJE_INICIAL = 'Hola, me interesa mucho conocer este apartamento. ¿Cuándo se puede visitar?'
const SLUG = `ia-e2e-${sufijo}`

let vendedorId = ''
let compradorId = ''
let propiedadId = ''
let rutaStorage = ''
let rutaFicha = ''

async function entrarComo(page: Page, correo: string, password: string) {
  await page.goto('/login')
  await page.fill('input[name="correo"]', correo)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 20000 })
}

async function enviarYEsperar(page: Page, boton: string) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST'),
    page.getByRole('button', { name: boton }).click(),
  ])
}

test.beforeAll(async () => {
  vendedorId = await crearUsuarioDePrueba({
    correo: CORREO_VENDEDOR,
    password: PASSWORD,
    rol: 'vendedor',
  })
  compradorId = await crearUsuarioDePrueba({
    correo: CORREO_COMPRADOR,
    password: PASSWORD,
    rol: 'comprador',
  })

  // Configurar disponibilidad del vendedor con auto_confirmar_citas = false
  await admin.from('disponibilidad_semanal').insert({
    vendedor_id: vendedorId,
    dia_semana: 1, // Lunes
    hora_inicio: '09:00:00',
    hora_fin: '18:00:00',
    auto_confirmar_citas: false,
  })

  const { data: barrios } = await admin
    .from('barrios')
    .select('id,slug')
    .eq('activo', true)
    .limit(1)
  const barrio = barrios![0]

  const { data: propiedad } = await admin
    .from('propiedades')
    .insert({
      vendedor_id: vendedorId,
      barrio_id: barrio.id,
      slug: SLUG,
      titulo: 'Apartamento de prueba para Agente IA E2E',
      descripcion: 'Excelente iluminacion natural en Chapinero.',
      operacion: 'venta',
      tipo_inmueble: 'apartamento',
      precio: 380000000,
    })
    .select('id')
    .single()
  propiedadId = propiedad!.id as string
  rutaFicha = `/${barrio.slug}/${SLUG}`

  rutaStorage = `${vendedorId}/${propiedadId}/foto.webp`
  const bytes = await sharp({
    create: { width: 80, height: 60, channels: 3, background: '#3b82f6' },
  })
    .webp()
    .toBuffer()
  await admin.storage
    .from('propiedades')
    .upload(rutaStorage, bytes, { contentType: 'image/webp' })

  await admin.from('imagenes_propiedad').insert({
    propiedad_id: propiedadId,
    ruta_storage: rutaStorage,
    alt_text: 'Fachada IA',
    orden: 0,
  })

  await admin
    .from('propiedades')
    .update({ estado: 'publicada' })
    .eq('id', propiedadId)
})

test.afterAll(async () => {
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

test.describe('Recorrido de Agentes IA de punta a punta', () => {
  test('Flujo completo: captura de lead, atencion con IA, confirmacion en 1 clic y auditoria', async ({
    browser,
  }) => {
    // 1. Comprador inicia sesion y envia formulario de contacto en la ficha
    const contextoComprador = await browser.newContext()
    const pageComprador = await contextoComprador.newPage()

    await entrarComo(pageComprador, CORREO_COMPRADOR, PASSWORD)
    await pageComprador.goto(rutaFicha)
    await expect(pageComprador.getByRole('heading', { level: 1 })).toBeVisible()

    await pageComprador.fill('input[name="telefono"]', '3001234567')
    await pageComprador.fill('textarea[name="mensaje"]', MENSAJE_INICIAL)
    await enviarYEsperar(pageComprador, 'Enviar mensaje')

    // Comprobar mensaje de exito
    await expect(pageComprador.getByText(/Tu mensaje se envio|Recibimos tu mensaje/i)).toBeVisible({
      timeout: 15000,
    })

    // 2. Drenar leads_nuevos_idx via cron HTTP endpoint
    const cronSecret = process.env.CRON_SECRET || 'desarrollo-cron-secreto-2026'
    await pageComprador.request.get('/api/cron/procesar-leads', {
      headers: { authorization: `Bearer ${cronSecret}` },
    })

    // 3. Comprador va a /mi-cuenta y revisa la respuesta del asistente
    await pageComprador.goto('/mi-cuenta')
    await expect(pageComprador.locator('h1')).toHaveText('Mi cuenta')

    // Debe existir el componente del chat
    const toggleChat = pageComprador.locator('[data-testid="boton-toggle-chat"]')
    await expect(toggleChat).toBeVisible({ timeout: 10000 })
    await toggleChat.click()

    // Verificar que el asistente virtual respondio al mensaje inicial
    await expect(pageComprador.locator('[data-testid="historial-mensajes"]')).toBeVisible()
    await expect(pageComprador.locator('[data-testid="mensaje-agente_ia"]')).toBeVisible({ timeout: 10000 })

    // 4. Comprador envia una pregunta por el chat interactivo
    const inputChat = pageComprador.locator('[data-testid="input-mensaje-chat"]')
    await inputChat.fill('¿El precio es negociable?')
    await pageComprador.locator('[data-testid="boton-enviar-chat"]').click()

    // Esperar respuesta en el chat
    await expect(pageComprador.locator('[data-testid="historial-mensajes"]')).toContainText(
      '¿El precio es negociable?',
    )

    // 5. Simular propuesta de cita en conversaciones_ia para el vendedor
    const { data: conv } = await admin
      .from('conversaciones_ia')
      .select('id, lead_id')
      .eq('comprador_id', compradorId)
      .single()

    expect(conv).toBeTruthy()

    // Obtener una fecha futura valida para la cita (un lunes a las 15:00 UTC)
    const fechaPropuesta = '2026-09-28T15:00:00.000Z'
    // Asegurar que el lead este aceptado para permitir confirmacion
    await admin.from('leads').update({ estado: 'aceptado' }).eq('id', conv!.lead_id)
    await admin
      .from('conversaciones_ia')
      .update({
        estado_conversacion: 'cita_propuesta',
        franja_propuesta: fechaPropuesta,
      })
      .eq('id', conv!.id)

    // 6. Vendedor inicia sesion y entra a /panel/citas
    const contextoVendedor = await browser.newContext()
    const pageVendedor = await contextoVendedor.newPage()

    await entrarComo(pageVendedor, CORREO_VENDEDOR, PASSWORD)
    await pageVendedor.goto('/panel/citas')

    // Debe aparecer la seccion de citas propuestas
    const seccionPropuestas = pageVendedor.locator('[data-testid="seccion-citas-propuestas"]')
    await expect(seccionPropuestas).toBeVisible({ timeout: 10000 })

    const botonConfirmar = pageVendedor.locator('[data-testid="boton-confirmar-propuesta"]')
    await expect(botonConfirmar).toBeVisible()
    await botonConfirmar.click()

    // Verificar confirmacion en 1 clic: la visita pasa de propuesta a la seccion de Confirmadas
    const seccionConfirmadas = pageVendedor.locator('section:has-text("Confirmadas")')
    await expect(seccionConfirmadas).toContainText('Apartamento de prueba para Agente IA E2E', {
      timeout: 15000,
    })
    await expect(seccionConfirmadas).toContainText('lunes, 28 de septiembre')

    // 7. Verificacion en registro_auditoria
    const { data: eventos } = await admin
      .from('registro_auditoria')
      .select('accion')
      .in('accion', ['ia_lead_atendido', 'ia_cita_aprobada_vendedor'])

    const accionesRegistradas = (eventos ?? []).map((e) => e.accion)
    expect(accionesRegistradas).toContain('ia_lead_atendido')

    await contextoComprador.close()
    await contextoVendedor.close()
  })
})
