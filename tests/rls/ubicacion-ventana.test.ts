import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin } from './ayudantes'
import {
  HORA_MS, ahoraDeLaBase, comoUsuario, crearCompradorConLead, crearVendedorConPropiedad, insertarCitaDirecta,
} from './ayudantes-citas'

const MINUTO_MS = 60 * 1000

async function escenarioVentana(desplazamientoMs: number, estado: 'confirmada' | 'cancelada' = 'confirmada') {
  const vendedor = await crearVendedorConPropiedad()
  const comprador = await crearCompradorConLead(vendedor, 'aceptado')
  const direccion = `Calle secreta ${randomUUID()}`
  const { error } = await clienteAdmin().from('propiedades_ubicacion')
    .upsert({ propiedad_id: vendedor.propiedadId, direccion }, { onConflict: 'propiedad_id' })
  if (error) throw error
  const ahora = await ahoraDeLaBase()
  const citaId = await insertarCitaDirecta({
    leadId: comprador.leadId, propiedadId: vendedor.propiedadId, compradorId: comprador.id,
    vendedorId: vendedor.id, inicio: new Date(ahora.getTime() + desplazamientoMs), estado,
  })
  return { vendedor, comprador, direccion, citaId }
}

async function direccionesVistas(cliente: SupabaseClient, propiedadId: string): Promise<string[]> {
  const { data, error } = await cliente.from('propiedades_ubicacion')
    .select('direccion').eq('propiedad_id', propiedadId)
  expect(error).toBeNull()
  return (data ?? []).map((fila) => fila.direccion as string)
}

describe('propiedades_ubicacion: el comprador ve la direccion solo en la ventana de su visita', () => {
  it('con la visita a inicio - 1:59 el comprador ve la direccion', async () => {
    const { vendedor, comprador, direccion } = await escenarioVentana(HORA_MS + 59 * MINUTO_MS)
    expect(await direccionesVistas(await comoUsuario(comprador.correo), vendedor.propiedadId)).toEqual([direccion])
  })

  it('con la visita a inicio - 2:01 el comprador no la ve', async () => {
    const { vendedor, comprador, direccion } = await escenarioVentana(2 * HORA_MS + MINUTO_MS)
    expect(await direccionesVistas(await comoUsuario(comprador.correo), vendedor.propiedadId)).toEqual([])
    expect(await direccionesVistas(await comoUsuario(vendedor.correo), vendedor.propiedadId)).toEqual([direccion])
  })

  it('terminada la visita no la ve', async () => {
    const { vendedor, comprador, direccion } = await escenarioVentana(-(HORA_MS + MINUTO_MS))
    expect(await direccionesVistas(await comoUsuario(comprador.correo), vendedor.propiedadId)).toEqual([])
    expect(await direccionesVistas(await comoUsuario(vendedor.correo), vendedor.propiedadId)).toEqual([direccion])
  })

  it('una visita cancelada no la revela aunque este dentro de la ventana', async () => {
    const { vendedor, comprador, direccion } = await escenarioVentana(HORA_MS, 'cancelada')
    expect(await direccionesVistas(await comoUsuario(comprador.correo), vendedor.propiedadId)).toEqual([])
    expect(await direccionesVistas(await comoUsuario(vendedor.correo), vendedor.propiedadId)).toEqual([direccion])
  })

  it('otro comprador de la misma propiedad, sin visita, no la ve', async () => {
    const { vendedor, comprador, direccion } = await escenarioVentana(HORA_MS)
    const otro = await crearCompradorConLead(vendedor, 'aceptado')
    expect(await direccionesVistas(await comoUsuario(otro.correo), vendedor.propiedadId)).toEqual([])
    expect(await direccionesVistas(await comoUsuario(comprador.correo), vendedor.propiedadId)).toEqual([direccion])
  })

  it('quien fue el vendedor de la visita no la ve si la propiedad cambio de dueno', async () => {
    const { vendedor: exVendedor, comprador, direccion } = await escenarioVentana(HORA_MS)
    const nuevoDueno = await crearVendedorConPropiedad()
    const reasignar = await clienteAdmin().from('propiedades')
      .update({ vendedor_id: nuevoDueno.id }).eq('id', exVendedor.propiedadId).select('id')
    expect(reasignar.data?.length).toBe(1)
    expect(await direccionesVistas(await comoUsuario(exVendedor.correo), exVendedor.propiedadId)).toEqual([])
    expect(await direccionesVistas(await comoUsuario(comprador.correo), exVendedor.propiedadId)).toEqual([direccion])
    expect(await direccionesVistas(await comoUsuario(nuevoDueno.correo), exVendedor.propiedadId)).toEqual([direccion])
  })
})
