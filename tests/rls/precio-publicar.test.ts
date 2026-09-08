import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { clienteAdmin, sesionVendedor } from './ayudantes'

// Falsificacion de la migracion 20260907000100 (propiedades_exigir_precio):
// aplicada, esta suite (entonces con una segunda prueba de INSERT que se
// quito despues, ver mas abajo) corrio en verde. Se rompio a proposito
// reemplazando la funcion por un `RETURN NEW` sin condicion -- la prueba de
// UPDATE ("sin precio, publicar por UPDATE...") paso a fallar en rojo,
// exactamente como se esperaba de un trigger roto que deja pasar todo. La
// prueba de INSERT que existia en ese momento NO se puso roja pese al
// trigger roto: eso es lo que llevo a quitarla (ver el comentario de abajo).
// Se revirtio el cambio (`supabase db reset`, que reaplica la migracion tal
// cual esta commiteada) y la suite volvio a verde. Salida real pegada en
// task-8-report.md.
describe('publicar exige precio (no NULL)', () => {
  let vendedorId: string
  let propiedadId: string
  let cliente: Awaited<ReturnType<typeof sesionVendedor>>

  beforeAll(async () => {
    cliente = await sesionVendedor()
    const { data: usuario } = await cliente.auth.getUser()
    vendedorId = usuario.user!.id

    // precio se omite a proposito: nace NULL, como nace un borrador real
    // desde que crearBorrador (src/app/(vendedor)/panel/propiedades/acciones.ts)
    // dejo de mandar el marcador `precio: 1`.
    const { data, error } = await cliente
      .from('propiedades')
      .insert({
        vendedor_id: vendedorId,
        titulo: 'Casa de prueba para el trigger de precio',
        descripcion: 'Descripcion suficiente para la prueba.',
        slug: `prueba-precio-${Date.now().toString(36)}`,
        operacion: 'venta', tipo_inmueble: 'casa',
      })
      .select('id').single()
    expect(error).toBeNull()
    propiedadId = data!.id

    // El trigger de imagenes (propiedades_exigir_imagen) tambien esta activo
    // sobre esta misma fila: sin una foto, el UPDATE de la primera prueba
    // fallaria con el 23514 de esa exigencia, no con el que se quiere medir
    // aqui. Se sube una imagen para aislar la prueba al precio.
    const { error: errorImagen } = await cliente.from('imagenes_propiedad').insert({
      propiedad_id: propiedadId,
      ruta_storage: 'prueba/imagen-precio.webp',
      alt_text: 'Fachada de la casa de prueba',
    })
    expect(errorImagen).toBeNull()
  })

  afterAll(async () => {
    await clienteAdmin().from('propiedades').delete().eq('id', propiedadId)
  })

  it('sin precio, publicar por UPDATE es rechazado por la base con 23514', async () => {
    const { error } = await cliente
      .from('propiedades').update({ estado: 'publicada' }).eq('id', propiedadId).select()
    expect(error?.code).toBe('23514')

    const { data } = await clienteAdmin()
      .from('propiedades').select('estado').eq('id', propiedadId).single()
    expect(data!.estado).toBe('borrador')
  })

  // A diferencia de imagen-publicar.test.ts, aqui NO hay una prueba simetrica
  // de "INSERT directo en estado publicada sin precio -> 23514". Hubo una, y
  // la falsificacion de este archivo la desenmascaro: con exigir_precio roto
  // a proposito (RETURN NEW sin condicion), esa prueba SEGUIA en verde. La
  // razon es la misma que ya documenta imagen-publicar.test.ts para su
  // propio caso: imagenes_propiedad referencia propiedades(id) por FK, asi
  // que ninguna imagen puede existir antes de que la fila exista. Todo
  // INSERT con estado = 'publicada' cae primero en propiedades_exigir_imagen
  // (dispara antes que propiedades_exigir_precio: Postgres ordena los
  // triggers BEFORE del mismo evento por nombre, e 'imagen' < 'precio'
  // alfabeticamente), que devuelve 23514 sin que el trigger de precio llegue
  // a evaluarse siquiera. La rama TG_OP = 'INSERT' de
  // exigir_precio_para_publicar() se deja en el codigo por simetria
  // defensiva con exigir_imagen_para_publicar() -- si algun dia cambia el
  // orden de los triggers o se relaja la exigencia de imagen, sigue cubierta
  // -- pero no hay forma de aislarla en una prueba mientras esa otra regla
  // exista, asi que se quito la prueba en vez de dejar una que "pasa en
  // verde" sin medir lo que dice medir.
  it('CASO POSITIVO: con precio puesto (y la imagen ya subida), publicar por UPDATE funciona', async () => {
    const { error: errorPrecio } = await cliente
      .from('propiedades').update({ precio: 150000000 }).eq('id', propiedadId).select()
    expect(errorPrecio).toBeNull()

    const { data, error } = await cliente
      .from('propiedades').update({ estado: 'publicada' }).eq('id', propiedadId).select('estado')
    expect(error).toBeNull()
    expect(data![0].estado).toBe('publicada')
  })
})
