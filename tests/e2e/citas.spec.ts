import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { clienteAdmin, crearUsuarioDePrueba } from '../rls/ayudantes'
import { HORA_MS, ahoraDeLaBase, consultar, insertarCitaDirecta } from '../rls/ayudantes-citas'

/**
 * SP5 de punta a punta. Cuentas EFIMERAS con randomUUID() en el correo, nunca
 * las del seed (ver el comentario de tests/e2e/leads.spec.ts).
 */

const admin = clienteAdmin()
const PASSWORD = 'CitasE2ePrueba2026*'

interface Montaje {
  vendedorId: string
  compradorId: string
  propiedadId: string
  leadId: string
  correoVendedor: string
  correoComprador: string
  direccion: string
}

const montajes: Montaje[] = []

/** Vendedor con propiedad y direccion, y un comprador con lead ACEPTADO. */
async function montar(etiqueta: string): Promise<Montaje> {
  const sufijo = randomUUID()
  const correoVendedor = `citas-e2e-${etiqueta}-vendedor-${sufijo}@prueba.test`
  const correoComprador = `citas-e2e-${etiqueta}-comprador-${sufijo}@prueba.test`
  const vendedorId = await crearUsuarioDePrueba({ correo: correoVendedor, password: PASSWORD, rol: 'vendedor' })
  const compradorId = await crearUsuarioDePrueba({ correo: correoComprador, password: PASSWORD, rol: 'comprador' })

  const { data: propiedad, error: errorPropiedad } = await admin.from('propiedades').insert({
    vendedor_id: vendedorId,
    slug: `citas-e2e-${etiqueta}-${sufijo}`,
    titulo: `Casa E2E para visitas ${etiqueta}`,
    descripcion: 'Descripcion de prueba, suficiente para el CHECK de longitud del campo.',
    operacion: 'venta',
    tipo_inmueble: 'casa',
    precio: 480000000,
  }).select('id').single()
  if (errorPropiedad) throw errorPropiedad
  const propiedadId = propiedad.id as string

  const direccion = `Carrera secreta E2E ${sufijo}`
  const { error: errorUbicacion } = await admin.from('propiedades_ubicacion')
    .upsert({ propiedad_id: propiedadId, direccion }, { onConflict: 'propiedad_id' })
  if (errorUbicacion) throw errorUbicacion

  const { data: lead, error: errorLead } = await admin.from('leads').insert({
    propiedad_id: propiedadId, comprador_id: compradorId, vendedor_id: vendedorId,
    nombre_mostrado: 'Comprador E2E', mensaje: 'Quisiera visitar la propiedad esta semana.', estado: 'aceptado',
  }).select('id').single()
  if (errorLead) throw errorLead

  const montaje = {
    vendedorId, compradorId, propiedadId, leadId: lead.id as string, correoVendedor, correoComprador, direccion,
  }
  montajes.push(montaje)
  return montaje
}

test.afterAll(async () => {
  for (const m of montajes) {
    await admin.from('propiedades').delete().eq('id', m.propiedadId)
    await admin.from('rutas_publicas_propiedad').delete().eq('propiedad_id', m.propiedadId)
    await admin.auth.admin.deleteUser(m.vendedorId)
    await admin.auth.admin.deleteUser(m.compradorId)
  }
})

/** Mismo patron que tests/e2e/leads.spec.ts: esperar a salir de /login antes de navegar. */
async function entrarComo(page: Page, correo: string) {
  await page.goto('/login')
  await page.fill('input[name="correo"]', correo)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15000 })
}

/** Espera la respuesta del POST del server action, no solo el click. */
async function pulsarYEsperar(page: Page, accion: () => Promise<void>) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST'),
    accion(),
  ])
}

test('recorrido completo: horario, reserva, visita en los dos paneles, mover y cancelar', async ({ browser }) => {
  const m = await montar('recorrido')

  const contextoVendedor = await browser.newContext()
  const contextoComprador = await browser.newContext()
  const vendedor = await contextoVendedor.newPage()
  const comprador = await contextoComprador.newPage()

  try {
    // --- El vendedor define su horario: los siete dias, de 00:00 a 24:00 ---
    await entrarComo(vendedor, m.correoVendedor)
    await vendedor.goto('/panel')
    await vendedor.getByRole('link', { name: 'Disponibilidad' }).click()
    await expect(vendedor).toHaveURL(/\/panel\/disponibilidad$/)

    for (const dia of ['1', '2', '3', '4', '5', '6', '7']) {
      await vendedor.selectOption('select[name="dia_semana"]', dia)
      await vendedor.selectOption('select[name="hora_inicio"]', '00:00')
      await vendedor.selectOption('select[name="hora_fin"]', '24:00')
      await pulsarYEsperar(vendedor, () => vendedor.getByRole('button', { name: 'Agregar franja' }).click())
    }
    await expect(vendedor.getByRole('button', { name: 'Quitar' })).toHaveCount(7)

    // --- El comprador reserva desde /mi-cuenta ---------------------------
    await entrarComo(comprador, m.correoComprador)
    await comprador.goto('/mi-cuenta')
    await comprador.getByRole('link', { name: 'Reservar visita' }).click()
    await expect(comprador).toHaveURL(new RegExp(`/mi-cuenta/reservar/${m.leadId}$`))

    const franjas = comprador.locator('button[name="inicio"]')
    await expect(franjas.nth(6)).toBeVisible()
    // No la primera franja: esa puede empezar a pocos segundos de now() + 2 h,
    // y la ventana de la direccion se abriria durante la prueba.
    const franjaReservada = await franjas.nth(3).getAttribute('value')
    const franjaNueva = await franjas.nth(6).getAttribute('value')
    expect(franjaReservada).toBeTruthy()
    expect(franjaNueva).toBeTruthy()

    await pulsarYEsperar(comprador, () => franjas.nth(3).click())
    await expect(comprador.getByText('Tu visita quedó confirmada.')).toBeVisible()

    const [cita] = await consultar<{ id: string; inicio: Date }>(
      `SELECT id, lower(rango) AS inicio FROM public.citas WHERE lead_id = $1 AND estado = 'confirmada'`, [m.leadId],
    )
    expect(cita?.inicio.getTime()).toBe(new Date(franjaReservada!).getTime())

    // --- La ve confirmada en /mi-cuenta, sin direccion en el HTML ----------
    await comprador.goto('/mi-cuenta')
    await expect(comprador.getByText('Visita confirmada')).toBeVisible()
    await expect(comprador.getByText('La dirección aparecerá 2 horas antes de la visita')).toBeVisible()
    expect(await comprador.content()).not.toContain(m.direccion)

    // --- El vendedor la ve en /panel/citas --------------------------------
    await vendedor.goto('/panel')
    await vendedor.getByRole('link', { name: 'Visitas', exact: true }).click()
    await expect(vendedor).toHaveURL(/\/panel\/citas$/)
    await expect(vendedor.getByText('Comprador E2E')).toBeVisible()

    // --- El comprador la mueve --------------------------------------------
    await comprador.getByRole('link', { name: 'Mover' }).click()
    await expect(comprador).toHaveURL(new RegExp(`/mi-cuenta/visitas/${cita!.id}/mover$`))
    await pulsarYEsperar(comprador, () =>
      comprador.locator(`button[name="inicio"][value="${franjaNueva}"]`).click())
    await expect(comprador.getByText('La visita se movió a la nueva franja.')).toBeVisible()

    const [movida] = await consultar<{ inicio: Date }>(
      'SELECT lower(rango) AS inicio FROM public.citas WHERE id = $1', [cita!.id],
    )
    expect(movida?.inicio.getTime()).toBe(new Date(franjaNueva!).getTime())

    // --- Y la cancela ------------------------------------------------------
    await comprador.goto('/mi-cuenta')
    await pulsarYEsperar(comprador, () => comprador.getByRole('button', { name: 'Cancelar' }).click())
    // No se espera el texto "Visita cancelada." de AccionesCita: revalidatePath
    // refresca /mi-cuenta en la misma respuesta, la solicitud ya no tiene visita
    // y el componente se desmonta. Lo observable es que vuelve a ofrecerse reservar.
    await expect(comprador.getByRole('link', { name: 'Reservar visita' })).toBeVisible()
    await expect(comprador.getByText('Visita confirmada')).toHaveCount(0)

    const { data: final } = await admin.from('citas').select('estado,cancelada_por').eq('id', cita!.id).single()
    expect(final).toEqual({ estado: 'cancelada', cancelada_por: m.compradorId })

    const { data: eventos } = await admin.from('registro_auditoria')
      .select('accion').eq('entidad', 'cita').eq('entidad_id', cita!.id)
    expect((eventos ?? []).map((e) => e.accion).sort()).toEqual(['cita_cancelada', 'cita_movida', 'cita_reservada'])
  } finally {
    await contextoVendedor.close()
    await contextoComprador.close()
  }
})

test('la direccion no esta en el HTML servido hasta 2 horas antes de la visita', async ({ browser }) => {
  // Uso (a) de insertarCitaDirecta, en los dos montajes: una visita a now() + 1 h
  // no se puede crear con reservar_cita por el horizonte de 2 horas, y la de
  // now() + 3 h se inserta igual para que las dos pruebas partan del mismo sitio.
  const lejos = await montar('lejos')
  const cerca = await montar('cerca')
  const ahora = await ahoraDeLaBase()

  await insertarCitaDirecta({
    leadId: lejos.leadId, propiedadId: lejos.propiedadId, compradorId: lejos.compradorId,
    vendedorId: lejos.vendedorId, inicio: new Date(ahora.getTime() + 3 * HORA_MS),
  })
  await insertarCitaDirecta({
    leadId: cerca.leadId, propiedadId: cerca.propiedadId, compradorId: cerca.compradorId,
    vendedorId: cerca.vendedorId, inicio: new Date(ahora.getTime() + HORA_MS),
  })

  const contextoLejos = await browser.newContext()
  const contextoCerca = await browser.newContext()
  try {
    const paginaLejos = await contextoLejos.newPage()
    await entrarComo(paginaLejos, lejos.correoComprador)
    await paginaLejos.goto('/mi-cuenta')
    await expect(paginaLejos.getByText('Visita confirmada')).toBeVisible()
    // Contra el HTML, no contra la pantalla: un dato en el payload RSC que el
    // CSS no muestre tambien es una fuga.
    const htmlLejos = await paginaLejos.content()
    expect(htmlLejos).not.toContain(lejos.direccion)
    expect(htmlLejos).toContain('La dirección aparecerá 2 horas antes de la visita')

    const paginaCerca = await contextoCerca.newPage()
    await entrarComo(paginaCerca, cerca.correoComprador)
    await paginaCerca.goto('/mi-cuenta')
    await expect(paginaCerca.getByText('Visita confirmada')).toBeVisible()
    expect(await paginaCerca.content()).toContain(cerca.direccion)
  } finally {
    await contextoLejos.close()
    await contextoCerca.close()
  }
})
