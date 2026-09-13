import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba, sesionVendedor } from './ayudantes'

const MENSAJE = 'Mensaje de prueba, suficiente para el CHECK de longitud.'

/**
 * Monta un comprador, un vendedor EFIMERO (randomUUID en el correo, nunca las
 * cuentas fijas del seed) y un lead 'nuevo' con su contacto, todo con
 * clienteAdmin() (service_role). El estado de la propiedad no importa aqui
 * -- a diferencia de crear-lead.test.ts, esta suite no ejercita crear_lead
 * ni su exigencia de 'publicada'; solo le interesa el trigger de transicion
 * sobre una fila de leads que ya existe, asi que la propiedad se deja en el
 * 'borrador' por defecto.
 */
async function fixturaConLead() {
  const admin = clienteAdmin()
  const sufijo = randomUUID()
  const password = 'TransicionLead2026*'
  const compradorCorreo = `transicion-comprador-${sufijo}@prueba.test`
  const vendedorCorreo = `transicion-vendedor-${sufijo}@prueba.test`

  const compradorId = await crearUsuarioDePrueba({
    correo: compradorCorreo, password, rol: 'comprador',
  })
  const vendedorId = await crearUsuarioDePrueba({
    correo: vendedorCorreo, password, rol: 'vendedor',
  })

  const { data: propiedad, error: errorPropiedad } = await admin
    .from('propiedades')
    .insert({
      vendedor_id: vendedorId,
      slug: `transicion-lead-${sufijo}`,
      titulo: 'Apartamento de prueba para transicion de leads',
      descripcion: 'Descripcion de prueba, suficiente para el CHECK de longitud.',
      operacion: 'venta',
      tipo_inmueble: 'apartamento',
      precio: 350000000,
    })
    .select('id')
    .single()
  if (errorPropiedad) throw errorPropiedad
  const propiedadId = propiedad.id as string

  const { data: lead, error: errorLead } = await admin
    .from('leads')
    .insert({
      propiedad_id: propiedadId,
      comprador_id: compradorId,
      vendedor_id: vendedorId,
      nombre_mostrado: 'Comprador de prueba',
      mensaje: MENSAJE,
    })
    .select('id')
    .single()
  if (errorLead) throw errorLead
  const leadId = lead.id as string

  const { error: errorContacto } = await admin.from('leads_contacto').insert({
    lead_id: leadId, correo: compradorCorreo, telefono: '3001234567',
  })
  if (errorContacto) throw errorContacto

  return { compradorCorreo, vendedorCorreo, password, compradorId, vendedorId, propiedadId, leadId }
}

describe('transicion de estado de un lead', () => {
  it('el vendedor acepta y entonces ve el contacto; antes no', async () => {
    const { vendedorCorreo, password, leadId } = await fixturaConLead()
    const vendedor = await clienteComo(vendedorCorreo, password)

    // Antes de aceptar: cero filas. No es un error de permisos, es que la
    // politica no deja ver la fila -- por eso se asserta la lista vacia.
    const antes = await vendedor.from('leads_contacto').select('correo').eq('lead_id', leadId)
    expect(antes.error).toBeNull()
    expect(antes.data ?? []).toEqual([])

    const aceptar = await vendedor.from('leads')
      .update({ estado: 'aceptado' }).eq('id', leadId).select('id')
    expect(aceptar.error).toBeNull()
    // .select() encadenado: un UPDATE de PostgREST que afecta CERO filas devuelve
    // error null. Sin esto, un fallo pasaria por exito.
    expect(aceptar.data?.length).toBe(1)

    const despues = await vendedor.from('leads_contacto').select('correo').eq('lead_id', leadId)
    expect(despues.data?.length).toBe(1)
  })

  it('un lead que ya salio de nuevo no vuelve a cambiar', async () => {
    const { vendedorCorreo, password, leadId } = await fixturaConLead()
    const vendedor = await clienteComo(vendedorCorreo, password)
    const primero = await vendedor.from('leads')
      .update({ estado: 'descartado' }).eq('id', leadId).select('id')
    expect(primero.error).toBeNull()
    expect(primero.data?.length).toBe(1)

    const segundo = await vendedor.from('leads')
      .update({ estado: 'aceptado' }).eq('id', leadId).select('id')
    expect(segundo.error?.message).toMatch(/ya fue respondido/i)
  })

  it('un vendedor ajeno no ve el lead ni su contacto en ningun estado', async () => {
    const { leadId } = await fixturaConLead()
    const ajeno = await sesionVendedor()

    expect((await ajeno.from('leads').select('id').eq('id', leadId)).data ?? []).toEqual([])
    expect((await ajeno.from('leads_contacto').select('correo').eq('lead_id', leadId)).data ?? [])
      .toEqual([])

    // Caso positivo: el lead existe de verdad, visto con service_role.
    const { data } = await clienteAdmin().from('leads').select('id').eq('id', leadId).single()
    expect(data?.id).toBe(leadId)
  })

  it('un vendedor ajeno no puede cambiar el estado de un lead ajeno', async () => {
    const { vendedorCorreo, password, leadId } = await fixturaConLead()
    const ajeno = await sesionVendedor()

    const intento = await ajeno.from('leads')
      .update({ estado: 'aceptado' }).eq('id', leadId).select('id')
    // error null es lo esperado -- un UPDATE de PostgREST sin politica
    // aplicable sobre la fila objetivo NO devuelve 42501, se acepta y no
    // cambia nada. Por eso el guardia real es el NUMERO DE FILAS, no el
    // error: una prueba que solo mirara `error` pasaria en verde con este
    // control roto.
    expect(intento.error).toBeNull()
    expect(intento.data?.length).toBe(0)

    // Contra la base, con service_role: el estado no se movio y la fila
    // nunca paso por el trigger de transicion.
    const admin = clienteAdmin()
    const { data: leadTrasIntento } = await admin.from('leads')
      .select('estado,respondido_en').eq('id', leadId).single()
    expect(leadTrasIntento?.estado).toBe('nuevo')
    expect(leadTrasIntento?.respondido_en).toBeNull()

    // Caso positivo en la misma prueba: el vendedor LEGITIMO si consigue una
    // fila sobre el mismo lead. Sin esto, "cero filas" arriba pasaria igual
    // si el lead no existiera o el UPDATE estuviera roto para cualquiera.
    const legitimo = await clienteComo(vendedorCorreo, password)
    const positivo = await legitimo.from('leads')
      .update({ estado: 'aceptado' }).eq('id', leadId).select('id')
    expect(positivo.error).toBeNull()
    expect(positivo.data?.length).toBe(1)
  })

  it('registra lead_aceptado y lead_descartado en registro_auditoria', async () => {
    const admin = clienteAdmin()

    const aceptado = await fixturaConLead()
    const vendedorAceptado = await clienteComo(aceptado.vendedorCorreo, aceptado.password)
    const actualizarAceptado = await vendedorAceptado.from('leads')
      .update({ estado: 'aceptado' }).eq('id', aceptado.leadId).select('id')
    expect(actualizarAceptado.error).toBeNull()
    expect(actualizarAceptado.data?.length).toBe(1)

    const { data: eventoAceptado, error: errorAceptado } = await admin
      .from('registro_auditoria')
      .select('actor_id,accion,entidad,entidad_id,metadatos')
      .eq('entidad', 'lead').eq('entidad_id', aceptado.leadId).eq('accion', 'lead_aceptado')
      .single()
    expect(errorAceptado).toBeNull()
    expect(eventoAceptado?.actor_id).toBe(aceptado.vendedorId)
    expect(eventoAceptado?.metadatos?.propiedad_id).toBe(aceptado.propiedadId)

    const { data: leadAceptado } = await admin.from('leads')
      .select('respondido_en').eq('id', aceptado.leadId).single()
    expect(leadAceptado?.respondido_en).not.toBeNull()

    const descartado = await fixturaConLead()
    const vendedorDescartado = await clienteComo(descartado.vendedorCorreo, descartado.password)
    const actualizarDescartado = await vendedorDescartado.from('leads')
      .update({ estado: 'descartado' }).eq('id', descartado.leadId).select('id')
    expect(actualizarDescartado.error).toBeNull()
    expect(actualizarDescartado.data?.length).toBe(1)

    const { data: eventoDescartado, error: errorDescartado } = await admin
      .from('registro_auditoria')
      .select('actor_id,accion,entidad,entidad_id,metadatos')
      .eq('entidad', 'lead').eq('entidad_id', descartado.leadId).eq('accion', 'lead_descartado')
      .single()
    expect(errorDescartado).toBeNull()
    expect(eventoDescartado?.actor_id).toBe(descartado.vendedorId)
    expect(eventoDescartado?.metadatos?.propiedad_id).toBe(descartado.propiedadId)

    // respondido_en tambien se fija en el camino 'descartado', no solo en
    // 'aceptado' -- las dos ramas del trigger lo tocan antes del INSERT de
    // auditoria.
    const { data: leadDescartado } = await admin.from('leads')
      .select('respondido_en').eq('id', descartado.leadId).single()
    expect(leadDescartado?.respondido_en).not.toBeNull()
  })
})
