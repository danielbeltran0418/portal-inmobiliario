import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

// Hallazgo H1 de la auditoria de seguridad (20261014000100): el vendedor podia
// devolver a 'publicada' un anuncio que el super_admin habia rechazado. Se
// ataca la API directa con el JWT del vendedor, no la interfaz.
const VENDEDOR = { correo: `moderacion-vendedor-${randomUUID()}@prueba.test`, password: 'ClaveDePrueba123!' }
const SUPER_ADMIN = { correo: `moderacion-admin-${randomUUID()}@prueba.test`, password: 'ClaveDePrueba123!' }

const PROPIEDAD_MODERADA = 'PR001'

let vendedor: SupabaseClient
let superAdmin: SupabaseClient
let idVendedor = ''
let barrioId = ''

const admin = clienteAdmin()

/** Propiedad del vendedor con foto (lista para publicar) en el estado pedido. */
async function crearPropiedad(estado: string): Promise<string> {
  const { data, error } = await admin
    .from('propiedades')
    .insert({
      vendedor_id: idVendedor,
      barrio_id: barrioId,
      slug: `moderacion-${randomUUID().slice(0, 8).replace(/[^a-z]/g, 'x')}`,
      titulo: 'Propiedad de prueba de moderacion',
      descripcion: 'Descripcion suficiente para la prueba.',
      operacion: 'venta',
      tipo_inmueble: 'casa',
      precio: 100000000,
      estado: 'borrador',
    })
    .select('id')
    .single()
  if (error) throw error
  const id = data!.id as string

  const { error: errorFoto } = await admin.from('imagenes_propiedad').insert({
    propiedad_id: id,
    ruta_storage: `${idVendedor}/${id}/foto.webp`,
    alt_text: 'Foto de prueba',
    orden: 0,
  })
  if (errorFoto) throw errorFoto

  if (estado !== 'borrador') {
    const { error: errorEstado } = await admin.from('propiedades').update({ estado }).eq('id', id)
    if (errorEstado) throw errorEstado
  }
  return id
}

async function estadoActual(id: string): Promise<string> {
  const { data } = await admin.from('propiedades').select('estado').eq('id', id).single()
  return data!.estado as string
}

beforeAll(async () => {
  idVendedor = await crearUsuarioDePrueba({ ...VENDEDOR, rol: 'vendedor' })
  await crearUsuarioDePrueba({ ...SUPER_ADMIN, rol: 'super_admin' })
  vendedor = await clienteComo(VENDEDOR.correo, VENDEDOR.password)
  superAdmin = await clienteComo(SUPER_ADMIN.correo, SUPER_ADMIN.password)
  const { data: barrio } = await admin.from('barrios').select('id').eq('slug', 'riomar').single()
  barrioId = barrio!.id
})

describe('H1: el vendedor no saca su anuncio de un estado moderado', () => {
  for (const destino of ['publicada', 'pausada', 'vendida', 'borrador']) {
    it(`rechazada -> ${destino} se rechaza con PR001`, async () => {
      const id = await crearPropiedad('rechazada')

      const { error } = await vendedor.from('propiedades').update({ estado: destino }).eq('id', id)

      expect(error?.code).toBe(PROPIEDAD_MODERADA)
      expect(await estadoActual(id)).toBe('rechazada')
    })
  }

  it('en_revision -> publicada se rechaza con PR001', async () => {
    const id = await crearPropiedad('en_revision')

    const { error } = await vendedor.from('propiedades').update({ estado: 'publicada' }).eq('id', id)

    expect(error?.code).toBe(PROPIEDAD_MODERADA)
    expect(await estadoActual(id)).toBe('en_revision')
  })

  it('el vendedor no puede poner un estado moderado', async () => {
    const id = await crearPropiedad('publicada')

    for (const destino of ['rechazada', 'en_revision']) {
      const { error } = await vendedor.from('propiedades').update({ estado: destino }).eq('id', id)
      expect(error?.code).toBe(PROPIEDAD_MODERADA)
    }
    expect(await estadoActual(id)).toBe('publicada')
  })

  it('el vendedor no puede crear una propiedad ya en estado moderado', async () => {
    const { error } = await vendedor.from('propiedades').insert({
      vendedor_id: idVendedor,
      barrio_id: barrioId,
      slug: `moderacion-alta-${randomUUID().slice(0, 8).replace(/[^a-z]/g, 'x')}`,
      titulo: 'Alta directa en revision',
      descripcion: 'Descripcion suficiente para la prueba.',
      operacion: 'venta',
      tipo_inmueble: 'casa',
      precio: 100000000,
      estado: 'en_revision',
    })

    expect(error?.code).toBe(PROPIEDAD_MODERADA)
  })

  it('el vendedor sigue pudiendo editar los datos de un anuncio rechazado (control positivo)', async () => {
    const id = await crearPropiedad('rechazada')

    const { data, error } = await vendedor
      .from('propiedades').update({ titulo: 'Titulo corregido tras moderacion' }).eq('id', id).select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(await estadoActual(id)).toBe('rechazada')
  })

  it('el vendedor sigue moviendo sus estados no moderados (control positivo)', async () => {
    const id = await crearPropiedad('publicada')

    const { error } = await vendedor.from('propiedades').update({ estado: 'pausada' }).eq('id', id)

    expect(error).toBeNull()
    expect(await estadoActual(id)).toBe('pausada')
  })
})

describe('H1: el super_admin conserva la moderacion', () => {
  it('rechaza y reactiva una propiedad ajena', async () => {
    const id = await crearPropiedad('publicada')

    const { error: errorRechazo } = await superAdmin.from('propiedades').update({ estado: 'rechazada' }).eq('id', id)
    expect(errorRechazo).toBeNull()
    expect(await estadoActual(id)).toBe('rechazada')

    const { error: errorReactivar } = await superAdmin.from('propiedades').update({ estado: 'publicada' }).eq('id', id)
    expect(errorReactivar).toBeNull()
    expect(await estadoActual(id)).toBe('publicada')
  })
})
