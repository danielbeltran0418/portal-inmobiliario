import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let clienteActual: SupabaseClient
vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => clienteActual,
}))

import { clienteAdmin } from './ayudantes'
import {
  crearVendedorConPropiedad,
  crearCompradorConLead,
  definirHorarioCompleto,
  franjasDe,
  comoUsuario,
} from './ayudantes-citas'
import { insertarConversacionDirecta } from './ayudantes-ia'
import { procesarSolicitudFranja } from '@/lib/ia/agendamiento'
import { aprobarCitaPropuesta } from '@/app/(vendedor)/panel/leads/acciones-ia'

// CN-004: la decision de aceptar un lead es del vendedor. Una herramienta del
// chat IA, disparada por lo que escriba el comprador, no puede tomarla por el.
async function escenario(autoConfirmar: boolean) {
  const vendedor = await crearVendedorConPropiedad()
  await definirHorarioCompleto(vendedor.id)
  const admin = clienteAdmin()
  await admin
    .from('disponibilidad_semanal')
    .update({ auto_confirmar_citas: autoConfirmar })
    .eq('vendedor_id', vendedor.id)

  const comprador = await crearCompradorConLead(vendedor, 'nuevo')
  const convId = await insertarConversacionDirecta({
    leadId: comprador.leadId,
    propiedadId: vendedor.propiedadId,
    compradorId: comprador.id,
    vendedorId: vendedor.id,
  })
  const franja = (await franjasDe(vendedor.id))[0]!
  return { admin, vendedor, comprador, convId, franja }
}

async function estadoDelLead(leadId: string): Promise<string> {
  const { data } = await clienteAdmin().from('leads').select('estado').eq('id', leadId).single()
  return data!.estado as string
}

describe('CN-004: el chat IA no acepta leads por el vendedor', () => {
  it('sin auto-confirmacion, proponer una franja deja el lead en nuevo', async () => {
    const { comprador, convId, franja } = await escenario(false)

    const res = await procesarSolicitudFranja(convId, franja)

    expect(res.tipo).toBe('propuesta')
    expect(await estadoDelLead(comprador.leadId)).toBe('nuevo')
  })

  it('con auto-confirmacion (decision previa del vendedor), reservar si acepta el lead (control positivo)', async () => {
    const { comprador, convId, franja } = await escenario(true)

    const res = await procesarSolicitudFranja(convId, franja)

    expect(res.tipo).toBe('confirmada')
    expect(await estadoDelLead(comprador.leadId)).toBe('aceptado')
  })

  it('al aprobar el vendedor la propuesta, el lead pasa a aceptado y la cita se reserva', async () => {
    const { admin, vendedor, comprador, convId, franja } = await escenario(false)
    await procesarSolicitudFranja(convId, franja)
    clienteActual = await comoUsuario(vendedor.correo)

    const res = await aprobarCitaPropuesta(convId)

    expect(res).toEqual({ ok: true })
    expect(await estadoDelLead(comprador.leadId)).toBe('aceptado')

    // La decision es del vendedor y asi queda en la auditoria: el actor es el.
    const { data: eventos } = await admin
      .from('registro_auditoria')
      .select('actor_id')
      .eq('accion', 'lead_aceptado')
      .eq('entidad_id', comprador.leadId)
    expect(eventos).toEqual([{ actor_id: vendedor.id }])
    const { data: citas } = await admin.from('citas').select('estado').eq('lead_id', comprador.leadId)
    expect(citas).toEqual([{ estado: 'confirmada' }])
  })

  it('el comprador no puede reservar por su cuenta mientras el vendedor no acepte', async () => {
    const { comprador, convId, franja } = await escenario(false)
    await procesarSolicitudFranja(convId, franja)

    const cliente = await comoUsuario(comprador.correo)
    const { error } = await cliente.rpc('reservar_cita', { p_lead_id: comprador.leadId, p_inicio: franja })

    expect(error).not.toBeNull()
  })
})
