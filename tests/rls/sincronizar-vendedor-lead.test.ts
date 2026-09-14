import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const MENSAJE = 'Mensaje de prueba, suficiente para el CHECK de longitud.'

/**
 * Hallazgo I2 de la revision final de SP4
 * (.superpowers/sdd/2026-09-11-sp4-leads/revision-final.md): `leads.vendedor_id`
 * no se sincronizaba cuando `propiedades.vendedor_id` cambiaba. El revisor lo
 * reprodujo con una sesion super_admin autentica reasignando una propiedad: el
 * vendedor ORIGINAL conservaba acceso completo (incluido el contacto) a leads
 * que ya no eran suyos, y el vendedor NUEVO no veia nada.
 *
 * Arreglo: 20260913000100_sincronizar_vendedor_lead.sql, un trigger AFTER
 * UPDATE ON propiedades que mueve `leads.vendedor_id` junto con la propiedad,
 * pero SOLO para los leads en 'nuevo' -- ver la decision documentada en esa
 * misma migracion sobre por que los leads ya respondidos NO se mueven.
 *
 * Monta sus propias cuentas EFIMERAS (randomUUID en el correo) por fixture,
 * igual que el resto de tests/rls.
 */
async function fixturaPropiedadConLead(opciones: { estadoLead?: 'nuevo' | 'aceptado' | 'descartado' } = {}) {
  const admin = clienteAdmin()
  const sufijo = randomUUID()
  const password = 'SincronizarLead2026*'

  const compradorCorreo = `sync-comprador-${sufijo}@prueba.test`
  const vendedorOriginalCorreo = `sync-vendedor-original-${sufijo}@prueba.test`
  const vendedorNuevoCorreo = `sync-vendedor-nuevo-${sufijo}@prueba.test`

  const compradorId = await crearUsuarioDePrueba({
    correo: compradorCorreo, password, rol: 'comprador',
  })
  const vendedorOriginalId = await crearUsuarioDePrueba({
    correo: vendedorOriginalCorreo, password, rol: 'vendedor',
  })
  const vendedorNuevoId = await crearUsuarioDePrueba({
    correo: vendedorNuevoCorreo, password, rol: 'vendedor',
  })

  const { data: propiedad, error: errorPropiedad } = await admin
    .from('propiedades')
    .insert({
      vendedor_id: vendedorOriginalId,
      slug: `sync-vendedor-lead-${sufijo}`,
      titulo: 'Apartamento de prueba para sincronizar vendedor',
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
      vendedor_id: vendedorOriginalId,
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

  if (opciones.estadoLead === 'aceptado' || opciones.estadoLead === 'descartado') {
    const vendedorOriginal = await clienteComo(vendedorOriginalCorreo, password)
    const responder = await vendedorOriginal.from('leads')
      .update({ estado: opciones.estadoLead }).eq('id', leadId).select('id')
    if (responder.error) throw responder.error
  }

  return {
    compradorId, vendedorOriginalId, vendedorNuevoId,
    vendedorOriginalCorreo, vendedorNuevoCorreo, password,
    propiedadId, leadId,
  }
}

describe('sincronizacion de vendedor_id en leads al reasignar una propiedad', () => {
  it('reasignar la propiedad mueve un lead NUEVO al vendedor nuevo; el original deja de verlo', async () => {
    const admin = clienteAdmin()
    const {
      vendedorOriginalId, vendedorNuevoId, vendedorOriginalCorreo, vendedorNuevoCorreo,
      password, propiedadId, leadId,
    } = await fixturaPropiedadConLead()

    // Caso positivo, antes de reasignar: leads.vendedor_id todavia apunta al
    // vendedor ORIGINAL, y el lo ve.
    const { data: leadAntes } = await admin.from('leads')
      .select('vendedor_id').eq('id', leadId).single()
    expect(leadAntes?.vendedor_id).toBe(vendedorOriginalId)

    const vendedorOriginal = await clienteComo(vendedorOriginalCorreo, password)
    const antes = await vendedorOriginal.from('leads').select('id').eq('id', leadId)
    expect(antes.data?.length).toBe(1)

    // Reasignacion de la propiedad. El camino real reproducido por el
    // revisor es una sesion super_admin autentica contra PostgREST (la
    // politica propiedades_actualizacion_super_admin ya esta cubierta por su
    // propia suite); clienteAdmin() (service_role) se usa aqui solo como
    // atajo de fixture para cambiar vendedor_id -- lo que esta prueba
    // verifica es el trigger de sincronizacion, no la politica de RLS que
    // permite el cambio.
    const { error: errorReasignar } = await admin
      .from('propiedades').update({ vendedor_id: vendedorNuevoId }).eq('id', propiedadId)
    expect(errorReasignar).toBeNull()

    const { data: leadTrasReasignar } = await admin.from('leads')
      .select('vendedor_id').eq('id', leadId).single()
    expect(leadTrasReasignar?.vendedor_id).toBe(vendedorNuevoId)

    // El vendedor ORIGINAL ya no ve el lead.
    const despuesOriginal = await vendedorOriginal.from('leads').select('id').eq('id', leadId)
    expect(despuesOriginal.data ?? []).toEqual([])
    expect(
      (await vendedorOriginal.from('leads_contacto').select('correo').eq('lead_id', leadId)).data ?? [],
    ).toEqual([])

    // El vendedor NUEVO ahora si lo ve, y puede aceptarlo con normalidad.
    const vendedorNuevo = await clienteComo(vendedorNuevoCorreo, password)
    const despuesNuevo = await vendedorNuevo.from('leads').select('id').eq('id', leadId)
    expect(despuesNuevo.data?.length).toBe(1)

    const aceptar = await vendedorNuevo.from('leads')
      .update({ estado: 'aceptado' }).eq('id', leadId).select('id')
    expect(aceptar.error).toBeNull()
    expect(aceptar.data?.length).toBe(1)

    // Verificacion final de la vulnerabilidad original: el vendedor
    // ORIGINAL, tras el traspaso, no puede aceptar el lead ni revelar el
    // contacto -- ni siquiera ahora que ya esta 'aceptado' por el otro.
    const intentoOriginal = await vendedorOriginal.from('leads')
      .update({ estado: 'descartado' }).eq('id', leadId).select('id')
    expect(intentoOriginal.error).toBeNull()
    expect(intentoOriginal.data?.length).toBe(0)
  })

  it('un lead ya ACEPTADO no se mueve al reasignar: el vendedor original conserva su historial', async () => {
    const admin = clienteAdmin()
    const {
      vendedorOriginalId, vendedorNuevoId, vendedorOriginalCorreo, vendedorNuevoCorreo,
      password, propiedadId, leadId,
    } = await fixturaPropiedadConLead({ estadoLead: 'aceptado' })

    const { error: errorReasignar } = await admin
      .from('propiedades').update({ vendedor_id: vendedorNuevoId }).eq('id', propiedadId)
    expect(errorReasignar).toBeNull()

    // Decision documentada en 20260913000100_sincronizar_vendedor_lead.sql:
    // un lead que ya salio de 'nuevo' NO se mueve. El vendedor original ya
    // vio el contacto y cerro la conversacion; el nuevo dueno hereda los
    // leads ABIERTOS de la propiedad, no el historial ajeno.
    const { data: leadTrasReasignar } = await admin.from('leads')
      .select('vendedor_id').eq('id', leadId).single()
    expect(leadTrasReasignar?.vendedor_id).toBe(vendedorOriginalId)

    // Caso positivo: el vendedor original SIGUE viendo el lead y su contacto.
    const vendedorOriginal = await clienteComo(vendedorOriginalCorreo, password)
    const sigueViendolo = await vendedorOriginal.from('leads').select('id').eq('id', leadId)
    expect(sigueViendolo.data?.length).toBe(1)
    const sigueViendoContacto = await vendedorOriginal.from('leads_contacto')
      .select('correo').eq('lead_id', leadId)
    expect(sigueViendoContacto.data?.length).toBe(1)

    // El vendedor nuevo NO ve un lead que nunca gestiono.
    const vendedorNuevo = await clienteComo(vendedorNuevoCorreo, password)
    const nuevoNoLoVe = await vendedorNuevo.from('leads').select('id').eq('id', leadId)
    expect(nuevoNoLoVe.data ?? []).toEqual([])
  })
})
