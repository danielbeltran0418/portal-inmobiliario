import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, clienteAnonimo, clienteComo } from './ayudantes'
import { crearVendedorConPropiedad, PASSWORD } from './ayudantes-citas'

/** Migracion 20261012000100: estrato, administracion, parqueaderos, año y piso. */
describe('campos colombianos de propiedades', () => {
  let vendedor: SupabaseClient
  let propiedadId = ''

  beforeAll(async () => {
    const v = await crearVendedorConPropiedad()
    propiedadId = v.propiedadId
    vendedor = await clienteComo(v.correo, PASSWORD)
  })

  it('el vendedor dueño puede escribirlos', async () => {
    const { data, error } = await vendedor.from('propiedades')
      .update({ estrato: 4, administracion: 350000, parqueaderos: 2, anio_construccion: 2015, piso: 8 })
      .eq('id', propiedadId).select('estrato, administracion, parqueaderos, anio_construccion, piso')
    expect(error).toBeNull()
    expect(data?.[0]).toMatchObject({ estrato: 4, parqueaderos: 2, anio_construccion: 2015, piso: 8 })
  })

  it.each([
    [{ estrato: 7 }], [{ estrato: 0 }], [{ administracion: -1 }], [{ parqueaderos: 51 }], [{ anio_construccion: 1700 }],
  ])('la base rechaza valores fuera de rango %j', async (valores) => {
    const { error } = await clienteAdmin().from('propiedades').update(valores).eq('id', propiedadId)
    expect(error?.code).toBe('23514')
  })

  it('anon puede leerlos (columnas publicas) y select(*) anonimo sigue funcionando', async () => {
    const { error } = await clienteAnonimo().from('propiedades').select('estrato, administracion, parqueaderos, anio_construccion, piso').limit(1)
    expect(error).toBeNull()
    const { error: asterisco } = await clienteAnonimo().from('propiedades').select('*').limit(1)
    expect(asterisco).toBeNull()
  })
})
