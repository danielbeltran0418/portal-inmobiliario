import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAdmin, clienteAnonimo } from './ayudantes'
import { crearVendedorConPropiedad } from './ayudantes-citas'

/** Migracion 20261011000100: la ficha publica solo recibe el centro de la celda. */
describe('zona_aproximada_propiedad', () => {
  let propiedadId = ''
  const LAT = 10.98763
  const LNG = -74.81234

  beforeAll(async () => {
    const vendedor = await crearVendedorConPropiedad()
    propiedadId = vendedor.propiedadId
    const admin = clienteAdmin()
    // Publicar exige al menos una imagen (20260904000300); con barrio, como en
    // tests/rls/catalogo-publico.test.ts.
    const { data: barrio } = await admin.from('barrios').select('id').eq('activo', true).limit(1).single()
    await admin.from('propiedades').update({ barrio_id: barrio!.id }).eq('id', propiedadId)
    const { error: errorImagen } = await admin.from('imagenes_propiedad').insert({
      propiedad_id: propiedadId, ruta_storage: `${vendedor.id}/${propiedadId}/zona.webp`, alt_text: 'Fachada de prueba', orden: 0,
    })
    if (errorImagen) throw errorImagen
    const { error } = await clienteAdmin().from('propiedades_ubicacion')
      .upsert({ propiedad_id: propiedadId, latitud: LAT, longitud: LNG }, { onConflict: 'propiedad_id' })
    if (error) throw error
  })

  it('anon recibe el centro de la celda de 0.005 grados, nunca el punto exacto', async () => {
    const { error: errorPublicar } = await clienteAdmin().from('propiedades').update({ estado: 'publicada' }).eq('id', propiedadId)
    expect(errorPublicar).toBeNull()
    const { data, error } = await clienteAnonimo().rpc('zona_aproximada_propiedad', { p_propiedad_id: propiedadId })
    expect(error).toBeNull()
    const [zona] = data as { latitud: number; longitud: number }[]
    expect(zona!.latitud).toBeCloseTo(10.9875, 6)
    expect(zona!.longitud).toBeCloseTo(-74.8125, 6)
    expect(zona!.latitud).not.toBeCloseTo(LAT, 4)
    // El circulo de 500 m siempre cubre el punto real.
    const metros = Math.hypot((zona!.latitud - LAT) * 111_320, (zona!.longitud - LNG) * 111_320 * Math.cos(LAT * Math.PI / 180))
    expect(metros).toBeLessThan(500)
  })

  it('una propiedad que no esta publicada no devuelve zona', async () => {
    await clienteAdmin().from('propiedades').update({ estado: 'pausada' }).eq('id', propiedadId)
    const { data } = await clienteAnonimo().rpc('zona_aproximada_propiedad', { p_propiedad_id: propiedadId })
    expect(data).toEqual([])
  })

  it('anon sigue sin poder leer la tabla de ubicaciones', async () => {
    const { data } = await clienteAnonimo().from('propiedades_ubicacion').select('latitud').eq('propiedad_id', propiedadId)
    expect(data ?? []).toEqual([])
  })
})
