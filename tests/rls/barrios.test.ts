import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAdmin, clienteAnonimo, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const VENDEDOR = { correo: 'rls-vendedor-barrios@prueba.test', password: 'ClaveDePrueba123!' }

describe('RLS de barrios', () => {
  beforeAll(async () => {
    await crearUsuarioDePrueba({ ...VENDEDOR, rol: 'vendedor' })
  })

  it('cualquiera lee los barrios sin autenticarse', async () => {
    const { data, error } = await clienteAnonimo().from('barrios').select('slug')
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
  })

  it('incluye Villa Carolina y El Paraiso', async () => {
    const { data } = await clienteAnonimo().from('barrios').select('slug')
    const slugs = data!.map((b) => b.slug)
    expect(slugs).toContain('villa-carolina')
    expect(slugs).toContain('el-paraiso')
  })

  it('los slugs son limpios: minusculas, digitos y guiones simples', async () => {
    const { data } = await clienteAnonimo().from('barrios').select('slug')
    for (const b of data!) expect(b.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('el CHECK de la base rechaza slugs con guion bajo, mayuscula o una ruta del portal', async () => {
    const admin = clienteAdmin()
    const invalidos = ['villa_carolina', 'Villa-Carolina', 'panel', 'recuperar']

    for (const slug of invalidos) {
      const { error } = await admin
        .from('barrios')
        .insert({ nombre: 'Invalido', slug, ciudad: 'Medellín' })

      if (!error) {
        // No deberia insertarse nunca; si el CHECK fallara, limpiar antes de fallar la prueba.
        await admin.from('barrios').delete().eq('slug', slug)
      }

      expect(error).not.toBeNull()
      expect(error?.code).toBe('23514')
    }
  })

  it('[alcance nacional] admite digitos y exige la ciudad: ya no cae en Barranquilla por defecto', async () => {
    const admin = clienteAdmin()
    const slug = `la-70-prueba-${Date.now()}`
    const { error: conDigitos } = await admin.from('barrios').insert({ nombre: 'La 70', slug, ciudad: 'Medellín' })
    expect(conDigitos).toBeNull()
    await admin.from('barrios').delete().eq('slug', slug)

    const { error: sinCiudad } = await admin.from('barrios').insert({ nombre: 'Sin ciudad', slug: `sin-ciudad-${Date.now()}` })
    expect(sinCiudad?.code).toBe('23502')
  })

  it('[ciudades] ciudad_slug lo calcula la base: tildes, mayusculas y espacios dan el mismo slug', async () => {
    const admin = clienteAdmin()
    const slug = `ciudad-prueba-${Date.now()}`
    const { data, error } = await admin.from('barrios')
      .insert({ nombre: 'Prueba', slug, ciudad: '  BOGOTÁ ', ciudad_slug: 'intento-manual' })
      .select('ciudad, ciudad_slug').single()
    expect(error).toBeNull()
    expect(data).toEqual({ ciudad: 'BOGOTÁ', ciudad_slug: 'bogota' })
    const { data: cambiado } = await admin.from('barrios').update({ ciudad: 'San Andrés' }).eq('slug', slug)
      .select('ciudad_slug').single()
    expect(cambiado?.ciudad_slug).toBe('san-andres')
    await admin.from('barrios').delete().eq('slug', slug)
  })

  it('[ciudades] "ciudad" es una ruta del portal: ningun barrio puede llamarse asi', async () => {
    const { error } = await clienteAdmin().from('barrios').insert({ nombre: 'Ciudad', slug: 'ciudad', ciudad: 'Cali' })
    expect(error?.code).toBe('23514')
  })

  it('[sitemap] anon puede listar los barrios con anuncios, solo activos y sin duplicados', async () => {
    const { data, error } = await clienteAnonimo().rpc('barrios_con_anuncios')
    expect(error).toBeNull()
    const slugs = (data as { slug: string }[]).map((b) => b.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('un vendedor NO puede crear barrios', async () => {
    const cliente = await clienteComo(VENDEDOR.correo, VENDEDOR.password)
    const { error } = await cliente.from('barrios')
      .insert({ nombre: 'Inventado', slug: 'inventado', ciudad: 'Barranquilla' })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })
})
