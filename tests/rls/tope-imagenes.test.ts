import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, rutaImagenPropia, sesionVendedor } from './ayudantes'

// Hallazgo L2 (20261014000200): el tope de 12 fotos por propiedad vivia solo
// en subirImagen(). Con el JWT del vendedor y PostgREST directo se podian
// insertar filas sin limite.
let vendedor: SupabaseClient
let propiedadId = ''
let barrioId = ''

beforeAll(async () => {
  vendedor = await sesionVendedor()
  const { data: usuario } = await vendedor.auth.getUser()
  const { data: barrio } = await clienteAdmin().from('barrios').select('id').eq('slug', 'riomar').single()
  barrioId = barrio!.id
  const { data, error } = await vendedor.from('propiedades').insert({
    vendedor_id: usuario.user!.id,
    barrio_id: barrioId,
    slug: `tope-fotos-${randomUUID().slice(0, 8)}`,
    titulo: 'Propiedad para el tope de fotos',
    descripcion: 'Descripcion suficiente para la prueba.',
    operacion: 'venta',
    tipo_inmueble: 'casa',
    precio: 100000000,
    estado: 'borrador',
  }).select('id').single()
  if (error) throw error
  propiedadId = data!.id
})

async function insertarFoto(n: number) {
  return vendedor.from('imagenes_propiedad').insert({
    propiedad_id: propiedadId,
    ruta_storage: await rutaImagenPropia(vendedor, propiedadId, `foto-${n}.webp`),
    alt_text: `Foto numero ${n} de la prueba`,
    orden: n,
  })
}

describe('L2: tope de fotos por propiedad en la base', () => {
  it('admite 12 fotos (control positivo) y rechaza la 13a con IM001', async () => {
    for (let n = 0; n < 12; n++) {
      const { error } = await insertarFoto(n)
      expect(error).toBeNull()
    }

    const { error } = await insertarFoto(12)
    expect(error?.code).toBe('IM001')

    const { count } = await clienteAdmin().from('imagenes_propiedad')
      .select('id', { count: 'exact', head: true }).eq('propiedad_id', propiedadId)
    expect(count).toBe(12)
  })
})
