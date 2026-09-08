import { describe, it, expect } from 'vitest'
import { clienteAdmin, clienteAnonimo, sesionVendedor } from './ayudantes'

describe('cola de limpieza de Storage', () => {
  it('borrar una propiedad encola las rutas de TODAS sus imagenes (borrado en cascada)', async () => {
    const cliente = await sesionVendedor()

    // vendedor_id no tiene DEFAULT (20260827000600_propiedades.sql): sin
    // fijarlo el insert nace con vendedor_id NULL y la politica
    // propiedades_insercion_dueno lo rechaza con 42501 antes de que este
    // trigger entre en juego (ver tests/rls/imagen-publicar.test.ts).
    const { data: usuario } = await cliente.auth.getUser()
    const vendedorId = usuario.user!.id

    // 'borrador' a proposito: 20260904000300_exigir_imagen_publicar.sql
    // rechaza con 23514 cualquier propiedad 'publicada' sin imagenes, y el
    // estado por defecto de la columna ya es 'borrador'.
    const { data: propiedad, error: errorPropiedad } = await cliente
      .from('propiedades')
      .insert({
        vendedor_id: vendedorId,
        titulo: 'Casa para probar la limpieza de Storage',
        descripcion: 'Descripcion suficiente para la prueba.',
        slug: `limpieza-${Date.now().toString(36)}`,
        operacion: 'venta',
        tipo_inmueble: 'casa',
        precio: 50000000,
      })
      .select('id')
      .single()
    expect(errorPropiedad).toBeNull()

    // Dos imagenes, no una: el caso que de verdad importa es que el trigger
    // dispare UNA VEZ POR CADA FILA que CASCADE borra, no solo una vez por la
    // sentencia. Con una sola imagen, un trigger STATEMENT-level mal escrito
    // (o una version que solo mirara la primera fila) pasaria igual.
    const rutaA = `prueba-limpieza/${Date.now()}-a.webp`
    const rutaB = `prueba-limpieza/${Date.now()}-b.webp`

    // orden explicito y distinto en cada fila: ambas nacerian en 0 por el
    // DEFAULT de la columna, y el UNIQUE (propiedad_id, orden) de
    // 20260908000300 (correccion del punto 5 de la revision final --
    // subirImagen ya no puede dejar dos fotos con el mismo orden) rechazaria
    // la segunda con 23505. El orden en si no es lo que esta prueba mide.
    const { error: errorImagenes } = await cliente.from('imagenes_propiedad').insert([
      { propiedad_id: propiedad!.id, ruta_storage: rutaA, alt_text: 'Fachada de la casa', orden: 0 },
      { propiedad_id: propiedad!.id, ruta_storage: rutaB, alt_text: 'Cocina de la casa', orden: 1 },
    ])
    expect(errorImagenes).toBeNull()

    // El borrado es de la PROPIEDAD, no de las imagenes: lo que se ejerce
    // aqui es el ON DELETE CASCADE de imagenes_propiedad.propiedad_id, no un
    // DELETE directo sobre imagenes_propiedad. Es el camino real: un vendedor
    // borra su ficha, nunca borra imagenes sueltas por su cuenta.
    const { error: errorBorrado } = await cliente
      .from('propiedades')
      .delete()
      .eq('id', propiedad!.id)
    expect(errorBorrado).toBeNull()

    const { data: cola, error: errorCola } = await clienteAdmin()
      .from('limpieza_almacenamiento')
      .select('ruta')
      .in('ruta', [rutaA, rutaB])
    expect(errorCola).toBeNull()
    expect((cola ?? []).map((f) => f.ruta).sort()).toEqual([rutaA, rutaB].sort())
  })

  it('un usuario autenticado no puede leer ni escribir la cola', async () => {
    const cliente = await sesionVendedor()

    const { data: lectura } = await cliente.from('limpieza_almacenamiento').select('id')
    expect(lectura ?? []).toHaveLength(0)

    const { error } = await cliente
      .from('limpieza_almacenamiento')
      .insert({ ruta: 'intruso/x.webp' })
      .select()
    expect(error?.code).toBe('42501')

    // Caso positivo de la misma prueba: la via legitima (service_role) si
    // funciona. Sin esto, un REVOKE que tambien le hubiera quitado el
    // privilegio a service_role por error pasaria igual de verde.
    const rutaLegitima = `legitimo/${Date.now()}.webp`
    const { error: errorAdmin } = await clienteAdmin()
      .from('limpieza_almacenamiento')
      .insert({ ruta: rutaLegitima })
      .select()
    expect(errorAdmin).toBeNull()
  })

  it('un anonimo tampoco', async () => {
    const { data: lectura } = await clienteAnonimo().from('limpieza_almacenamiento').select('id')
    expect(lectura ?? []).toHaveLength(0)

    const { error } = await clienteAnonimo()
      .from('limpieza_almacenamiento')
      .insert({ ruta: 'anon/x.webp' })
      .select()
    expect(error?.code).toBe('42501')
  })
})
