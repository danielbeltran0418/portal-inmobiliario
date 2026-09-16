import { describe, it, expect } from 'vitest'
import { clienteAdmin, clienteAnonimo, crearUsuarioDePrueba } from './ayudantes'
import {
  escenarioIA,
  comoUsuario,
  PASSWORD,
} from './ayudantes-ia'
import { crearCompradorConLead, crearVendedorConPropiedad } from './ayudantes-citas'
import { randomUUID } from 'node:crypto'

describe('SP6 — Esquema y RLS de conversaciones_ia y mensajes_ia', () => {
  it('comprador lee su conversacion y sus mensajes; no lee los de otro comprador', async () => {
    const { comprador: dueno, conversacionId, mensajeId } = await escenarioIA()
    const ajeno = await crearCompradorConLead(await crearVendedorConPropiedad(), 'nuevo')

    const clienteDueno = await comoUsuario(dueno.correo)
    const { data: convDueno } = await clienteDueno
      .from('conversaciones_ia')
      .select('id')
      .eq('id', conversacionId)
      .single()
    expect(convDueno?.id).toBe(conversacionId)

    const { data: msgsDueno } = await clienteDueno
      .from('mensajes_ia')
      .select('id')
      .eq('conversacion_id', conversacionId)
    expect(msgsDueno?.map((m) => m.id)).toContain(mensajeId)

    const clienteAjeno = await comoUsuario(ajeno.correo)
    const { data: convAjeno } = await clienteAjeno
      .from('conversaciones_ia')
      .select('id')
      .eq('id', conversacionId)
    expect(convAjeno).toEqual([])

    const { data: msgsAjeno } = await clienteAjeno
      .from('mensajes_ia')
      .select('id')
      .eq('conversacion_id', conversacionId)
    expect(msgsAjeno).toEqual([])
  })

  it('vendedor lee las conversaciones y mensajes de sus propiedades; no las de otro vendedor', async () => {
    const { vendedor: dueno, conversacionId, mensajeId } = await escenarioIA()
    const vendedorAjeno = await crearVendedorConPropiedad()

    const clienteDueno = await comoUsuario(dueno.correo)
    const { data: convDueno } = await clienteDueno
      .from('conversaciones_ia')
      .select('id')
      .eq('id', conversacionId)
      .single()
    expect(convDueno?.id).toBe(conversacionId)

    const { data: msgsDueno } = await clienteDueno
      .from('mensajes_ia')
      .select('id')
      .eq('conversacion_id', conversacionId)
    expect(msgsDueno?.map((m) => m.id)).toContain(mensajeId)

    const clienteAjeno = await comoUsuario(vendedorAjeno.correo)
    const { data: convAjeno } = await clienteAjeno
      .from('conversaciones_ia')
      .select('id')
      .eq('id', conversacionId)
    expect(convAjeno).toEqual([])

    const { data: msgsAjeno } = await clienteAjeno
      .from('mensajes_ia')
      .select('id')
      .eq('conversacion_id', conversacionId)
    expect(msgsAjeno).toEqual([])
  })

  it('super admin lee todas las conversaciones y mensajes (cuenta efimera)', async () => {
    const { conversacionId, mensajeId } = await escenarioIA()
    const correoSuperAdmin = `ia-admin-${randomUUID()}@prueba.test`
    await crearUsuarioDePrueba({ correo: correoSuperAdmin, password: PASSWORD, rol: 'super_admin' })
    const clienteSuperAdmin = await comoUsuario(correoSuperAdmin)

    const { data: conv } = await clienteSuperAdmin
      .from('conversaciones_ia')
      .select('id')
      .eq('id', conversacionId)
      .single()
    expect(conv?.id).toBe(conversacionId)

    const { data: msgs } = await clienteSuperAdmin
      .from('mensajes_ia')
      .select('id')
      .eq('id', mensajeId)
      .single()
    expect(msgs?.id).toBe(mensajeId)
  })

  it('anonimo no lee conversaciones_ia ni mensajes_ia (recibe 42501 por falta de GRANT SELECT)', async () => {
    const { conversacionId, mensajeId } = await escenarioIA()
    const anon = clienteAnonimo()

    const { data: conv, error: errConv } = await anon
      .from('conversaciones_ia')
      .select('id')
      .eq('id', conversacionId)
    expect(errConv?.code).toBe('42501')
    expect(conv).toBeNull()

    const { data: msgs, error: errMsgs } = await anon
      .from('mensajes_ia')
      .select('id')
      .eq('id', mensajeId)
    expect(errMsgs?.code).toBe('42501')
    expect(msgs).toBeNull()
  })

  it('authenticated recibe 42501 al intentar INSERT, UPDATE o DELETE directo sobre conversaciones_ia y mensajes_ia', async () => {
    const { comprador, vendedor, conversacionId, mensajeId } = await escenarioIA()
    const cliente = await comoUsuario(comprador.correo)

    // Intento de INSERT directo en conversaciones_ia
    const insConv = await cliente.from('conversaciones_ia').insert({
      lead_id: comprador.leadId,
      propiedad_id: vendedor.propiedadId,
      comprador_id: comprador.id,
      vendedor_id: vendedor.id,
    })
    expect(insConv.error?.code).toBe('42501')

    // Intento de UPDATE directo en conversaciones_ia
    const updConv = await cliente
      .from('conversaciones_ia')
      .update({ estado_conversacion: 'cerrada' })
      .eq('id', conversacionId)
      .select()
    expect(updConv.error?.code).toBe('42501')
    expect(updConv.data).toBeNull()

    // Intento de DELETE directo en conversaciones_ia
    const delConv = await cliente
      .from('conversaciones_ia')
      .delete()
      .eq('id', conversacionId)
    expect(delConv.error?.code).toBe('42501')

    // Intento de INSERT directo en mensajes_ia
    const insMsg = await cliente.from('mensajes_ia').insert({
      conversacion_id: conversacionId,
      comprador_id: comprador.id,
      vendedor_id: vendedor.id,
      emisor: 'comprador',
      contenido: 'Mensaje malicioso directo',
    })
    expect(insMsg.error?.code).toBe('42501')

    // Intento de UPDATE directo en mensajes_ia (inmutabilidad estricta)
    const updMsg = await cliente
      .from('mensajes_ia')
      .update({ contenido: 'Modificado ilegitimamente' })
      .eq('id', mensajeId)
      .select()
    expect(updMsg.error?.code).toBe('42501')
    expect(updMsg.data).toBeNull()

    // Intento de DELETE directo en mensajes_ia
    const delMsg = await cliente
      .from('mensajes_ia')
      .delete()
      .eq('id', mensajeId)
    expect(delMsg.error?.code).toBe('42501')

    // Verificamos que los datos siguen intactos
    const { data: convActual } = await clienteAdmin()
      .from('conversaciones_ia')
      .select('estado_conversacion')
      .eq('id', conversacionId)
      .single()
    expect(convActual?.estado_conversacion).toBe('activa')
  })

  it('la columna auto_confirmar_citas en disponibilidad_semanal existe y es modificable por el vendedor dueno', async () => {
    const vendedor = await crearVendedorConPropiedad()
    const cliente = await comoUsuario(vendedor.correo)

    // Insertar disponibilidad semanal con auto_confirmar_citas = true
    const { error: insErr } = await cliente.from('disponibilidad_semanal').insert({
      vendedor_id: vendedor.id,
      dia_semana: 1,
      hora_inicio: '08:00',
      hora_fin: '12:00',
      auto_confirmar_citas: true,
    })
    expect(insErr).toBeNull()

    const { data: fila } = await cliente
      .from('disponibilidad_semanal')
      .select('auto_confirmar_citas')
      .eq('vendedor_id', vendedor.id)
      .single()
    expect(fila?.auto_confirmar_citas).toBe(true)

    // Modificar el flag a false
    const { error: updErr } = await cliente
      .from('disponibilidad_semanal')
      .update({ auto_confirmar_citas: false })
      .eq('vendedor_id', vendedor.id)
    expect(updErr).toBeNull()

    const { data: filaActualizada } = await cliente
      .from('disponibilidad_semanal')
      .select('auto_confirmar_citas')
      .eq('vendedor_id', vendedor.id)
      .single()
    expect(filaActualizada?.auto_confirmar_citas).toBe(false)
  })
})
