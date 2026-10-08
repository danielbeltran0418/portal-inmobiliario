import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba, sesionVendedor } from './ayudantes'

// CN-001 (auditoria Cyber Neo 2026-10-06): authenticated tiene UPDATE sobre
// toda la tabla y la politica del dueno solo mira vendedor_id. Sin una
// guarda en la base, el vendedor deshacia la suspension del admin
// (rechazada -> publicada) y se marcaba destacada, que es de pago.
// Cada prueba fija tambien el caso positivo: sin el, un 42501 por cualquier
// otra causa (o una fila que no es suya) pasaria en verde.

const SUPER_ADMIN = { correo: `mod-admin-${Date.now()}@prueba.test`, password: 'ClaveDePrueba123!' }

// El CHECK de slug solo admite letras y guiones.
let contadorSlug = 0
function slugUnico(prefijo: string): string {
  const sufijo = `${Date.now()}${contadorSlug++}`.replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)])
  return `${prefijo}-${sufijo}`
}

describe('Moderacion de propiedades: el vendedor no pisa decisiones del admin', () => {
  let vendedor: SupabaseClient
  let superAdmin: SupabaseClient
  let vendedorId: string
  const creadas: string[] = []

  const base = () => ({
    vendedor_id: vendedorId,
    titulo: 'Propiedad para pruebas de moderacion',
    descripcion: 'Descripcion de prueba para la guarda de moderacion.',
    operacion: 'venta',
    tipo_inmueble: 'apartamento',
    precio: 250000000,
    estado: 'borrador',
  })

  async function crearPublicada(): Promise<string> {
    const { data, error } = await vendedor
      .from('propiedades')
      .insert({ ...base(), slug: slugUnico('moderacion') })
      .select('id')
      .single()
    expect(error).toBeNull()
    const id = data!.id as string
    creadas.push(id)

    const { error: errImg } = await clienteAdmin().from('imagenes_propiedad').insert({
      propiedad_id: id,
      ruta_storage: `${vendedorId}/${id}/foto.webp`,
      alt_text: 'Foto de prueba',
      orden: 0,
    })
    expect(errImg).toBeNull()

    const { data: pub, error: errPub } = await vendedor
      .from('propiedades').update({ estado: 'publicada' }).eq('id', id).select('id')
    expect(errPub).toBeNull()
    expect(pub).toHaveLength(1)
    return id
  }

  async function suspender(id: string) {
    const { data, error } = await superAdmin
      .from('propiedades').update({ estado: 'rechazada' }).eq('id', id).select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  }

  async function filaDe(id: string) {
    const { data } = await clienteAdmin()
      .from('propiedades').select('estado, destacada, destacada_hasta').eq('id', id).single()
    return data!
  }

  beforeAll(async () => {
    vendedor = await sesionVendedor()
    const { data: u } = await vendedor.auth.getUser()
    vendedorId = u.user!.id
    await crearUsuarioDePrueba({ ...SUPER_ADMIN, rol: 'super_admin' })
    superAdmin = await clienteComo(SUPER_ADMIN.correo, SUPER_ADMIN.password)
  })

  afterAll(async () => {
    if (creadas.length) await clienteAdmin().from('propiedades').delete().in('id', creadas)
  })

  it('el vendedor NO puede sacar de rechazada su propiedad suspendida, a ningun estado', async () => {
    const id = await crearPublicada()

    // Positivo: antes de la suspension, el dueno si cambia el estado.
    const { data: pausa, error: errPausa } = await vendedor
      .from('propiedades').update({ estado: 'pausada' }).eq('id', id).select('id')
    expect(errPausa).toBeNull()
    expect(pausa).toHaveLength(1)

    await suspender(id)

    for (const destino of ['publicada', 'pausada', 'borrador', 'vendida'] as const) {
      const { error } = await vendedor
        .from('propiedades').update({ estado: destino }).eq('id', id).select('id')
      expect(error?.code, `rechazada -> ${destino}`).toBe('42501')
    }
    expect((await filaDe(id)).estado).toBe('rechazada')
  })

  it('el vendedor SI puede corregir los datos de su propiedad suspendida', async () => {
    const id = await crearPublicada()
    await suspender(id)

    const { data, error } = await vendedor
      .from('propiedades')
      .update({ titulo: 'Titulo corregido tras la moderacion' })
      .eq('id', id)
      .select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('el super_admin SI puede reactivar una propiedad suspendida', async () => {
    const id = await crearPublicada()
    await suspender(id)

    const { data, error } = await superAdmin
      .from('propiedades').update({ estado: 'publicada' }).eq('id', id).select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect((await filaDe(id)).estado).toBe('publicada')
  })

  // La guarda exime a todo current_user que no sea authenticated/anon. Sin
  // esta prueba, cambiar esa exencion por "solo super_admin" pasaba en verde:
  // el resto de suites escribe destacada a traves de un super_admin, nunca
  // como sistema (service_role, el cron de vigencia de destacadas).
  it('el sistema (service_role) SI puede destacar y sacar de rechazada', async () => {
    const id = await crearPublicada()
    await suspender(id)

    const { data: reactivada, error: errReact } = await clienteAdmin()
      .from('propiedades').update({ estado: 'publicada' }).eq('id', id).select('id')
    expect(errReact).toBeNull()
    expect(reactivada).toHaveLength(1)

    const { data: destacada, error: errDest } = await clienteAdmin()
      .from('propiedades').update({ destacada: true }).eq('id', id).select('id')
    expect(errDest).toBeNull()
    expect(destacada).toHaveLength(1)

    const fila = await filaDe(id)
    expect(fila.estado).toBe('publicada')
    expect(fila.destacada).toBe(true)
  })

  it('el vendedor NO puede ponerse rechazada a si mismo', async () => {
    const id = await crearPublicada()
    const { error } = await vendedor
      .from('propiedades').update({ estado: 'rechazada' }).eq('id', id).select('id')
    expect(error?.code).toBe('42501')
    expect((await filaDe(id)).estado).toBe('publicada')
  })

  it('el vendedor NO puede marcar su propiedad como destacada', async () => {
    const id = await crearPublicada()

    // Positivo: la misma fila y el mismo cliente si actualizan otra columna.
    const { data: ok, error: errOk } = await vendedor
      .from('propiedades').update({ habitaciones: 3 }).eq('id', id).select('id')
    expect(errOk).toBeNull()
    expect(ok).toHaveLength(1)

    const { error: errDest } = await vendedor
      .from('propiedades').update({ destacada: true }).eq('id', id).select('id')
    expect(errDest?.code).toBe('42501')

    const { error: errHasta } = await vendedor
      .from('propiedades')
      .update({ destacada_hasta: new Date(Date.now() + 86_400_000).toISOString() })
      .eq('id', id)
      .select('id')
    expect(errHasta?.code).toBe('42501')

    const fila = await filaDe(id)
    expect(fila.destacada).toBe(false)
    expect(fila.destacada_hasta).toBeNull()
  })

  it('el vendedor NO puede crear una propiedad ya destacada ni ya rechazada', async () => {
    const { data: ok, error: errOk } = await vendedor
      .from('propiedades')
      .insert({ ...base(), slug: slugUnico('insercion') })
      .select('id')
      .single()
    expect(errOk).toBeNull()
    creadas.push(ok!.id as string)

    const { error: errDest } = await vendedor
      .from('propiedades')
      .insert({ ...base(), destacada: true, slug: slugUnico('insercion') })
      .select('id')
    expect(errDest?.code).toBe('42501')

    const { error: errRech } = await vendedor
      .from('propiedades')
      .insert({ ...base(), estado: 'rechazada', slug: slugUnico('insercion') })
      .select('id')
    expect(errRech?.code).toBe('42501')
  })
})
