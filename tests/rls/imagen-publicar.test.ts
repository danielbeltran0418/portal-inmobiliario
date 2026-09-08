import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { clienteAdmin, sesionVendedor } from './ayudantes'

describe('publicar exige al menos una imagen', () => {
  let vendedorId: string
  let propiedadId: string
  let cliente: Awaited<ReturnType<typeof sesionVendedor>>

  beforeAll(async () => {
    cliente = await sesionVendedor()

    // vendedor_id no tiene DEFAULT (ver 20260827000600_propiedades.sql): sin
    // fijarlo aqui, la fila nace con vendedor_id NULL y la politica
    // propiedades_insercion_dueno (WITH CHECK vendedor_id = auth.uid())
    // rechaza el insert con 42501 antes de que el trigger de esta migracion
    // entre en juego. Comprobado: con este insert tal cual lo escribe el
    // brief (sin vendedor_id), la suite entera falla en el beforeAll con
    // 42501, no con lo que se quiere medir.
    const { data: usuario } = await cliente.auth.getUser()
    vendedorId = usuario.user!.id

    const { data, error } = await cliente
      .from('propiedades')
      .insert({
        vendedor_id: vendedorId,
        titulo: 'Casa de prueba para el trigger',
        descripcion: 'Descripcion suficiente para la prueba.',
        slug: `prueba-trigger-${Date.now().toString(36)}`,
        operacion: 'venta', tipo_inmueble: 'casa', precio: 100000000,
      })
      .select('id').single()
    expect(error).toBeNull()
    propiedadId = data!.id
  })

  afterAll(async () => {
    await clienteAdmin().from('propiedades').delete().eq('id', propiedadId)
  })

  it('sin imagenes, publicar por UPDATE es rechazado por la base con 23514', async () => {
    const { error } = await cliente
      .from('propiedades').update({ estado: 'publicada' }).eq('id', propiedadId).select()
    expect(error?.code).toBe('23514')

    const { data } = await clienteAdmin()
      .from('propiedades').select('estado').eq('id', propiedadId).single()
    expect(data!.estado).toBe('borrador')
  })

  // El trigger cubre dos caminos: la transicion UPDATE (prueba de arriba) y
  // el INSERT que nace ya en 'publicada' (esta prueba). Son ramas de codigo
  // distintas dentro de exigir_imagen_para_publicar() -- TG_OP = 'INSERT' vs.
  // OLD.estado IS DISTINCT FROM 'publicada' -- y en un BEFORE INSERT no hay
  // fila OLD: sin la rama TG_OP = 'INSERT', referenciar OLD.estado ahi
  // levantaria "record old is not assigned yet" en vez de aplicar la regla.
  //
  // No hay caso positivo simetrico para el INSERT: imagenes_propiedad.
  // propiedad_id referencia propiedades(id), asi que ninguna imagen puede
  // existir antes de que la propiedad exista. Un INSERT con estado
  // 'publicada' esta siempre vacio de imagenes en el momento en que el
  // trigger lo evalua; el camino real para publicar con foto es el que
  // prueba el caso positivo de abajo: crear en borrador, subir la imagen,
  // luego UPDATE a publicada.
  it('sin imagenes, un INSERT directo en estado publicada tambien es rechazado con 23514', async () => {
    const slug = `prueba-trigger-insert-${Date.now().toString(36)}`
    const { data, error } = await cliente
      .from('propiedades')
      .insert({
        vendedor_id: vendedorId,
        titulo: 'Casa publicada de una vez sin fotos',
        descripcion: 'Descripcion suficiente para la prueba.',
        slug,
        operacion: 'venta', tipo_inmueble: 'casa', precio: 100000000,
        estado: 'publicada',
      })
      .select('id')
    expect(error?.code).toBe('23514')
    expect(data ?? []).toHaveLength(0)

    // Con service_role, que salta RLS: la fila no llego a existir en
    // absoluto, no es solo que RLS la esconda.
    const { data: enBase } = await clienteAdmin()
      .from('propiedades').select('id').eq('slug', slug)
    expect(enBase ?? []).toHaveLength(0)
  })

  it('CASO POSITIVO: con una imagen, publicar por UPDATE funciona', async () => {
    const { error: errorImagen } = await cliente.from('imagenes_propiedad').insert({
      propiedad_id: propiedadId,
      ruta_storage: 'prueba/imagen.webp',
      alt_text: 'Fachada de la casa de prueba',
    })
    expect(errorImagen).toBeNull()

    const { data, error } = await cliente
      .from('propiedades').update({ estado: 'publicada' }).eq('id', propiedadId).select('estado')
    expect(error).toBeNull()
    expect(data![0].estado).toBe('publicada')
  })
})
