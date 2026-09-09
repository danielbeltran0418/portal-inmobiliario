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

// Ticket de alta prioridad: exigir_precio_para_publicar() (20260907000100)
// solo vigilaba la TRANSICION hacia 'publicada' (TG_OP = 'INSERT' O
// OLD.estado IS DISTINCT FROM 'publicada'). Con OLD.estado = 'publicada' Y
// NEW.estado = 'publicada' (un UPDATE que deja el estado como estaba), esa
// condicion es falsa y el UPDATE pasaba aunque NEW.precio fuera NULL:
// `UPDATE propiedades SET precio = NULL WHERE id = <una publicada>` tenia
// exito. 20260908000400_precio_no_vaciable_en_publicada.sql quita la
// condicion de transicion: la exigencia aplica siempre que NEW.estado sea
// 'publicada', sin importar TG_OP ni OLD.estado.
//
// FALSIFICACION: con la migracion 20260908000400 revertida (funcion vuelta a
// la version de 20260907000100) la primera prueba de este bloque
// ("vaciar el precio de una publicada es rechazado") se puso en ROJO -- el
// UPDATE tuvo exito y el precio quedo en NULL. Con la migracion restaurada
// (`supabase db reset`) volvio a verde. Salida real pegada en
// arreglo-precio-publicada-report.md.
describe('no se puede vaciar el precio de una propiedad ya publicada', () => {
  let vendedorId: string
  let propiedadId: string
  let borradorId: string
  let cliente: Awaited<ReturnType<typeof sesionVendedor>>

  beforeAll(async () => {
    cliente = await sesionVendedor()
    const { data: usuario } = await cliente.auth.getUser()
    vendedorId = usuario.user!.id

    // Propiedad que se va a PUBLICAR de verdad (con imagen y precio), para
    // luego intentar vaciarle el precio sin tocar el estado.
    const { data, error } = await cliente
      .from('propiedades')
      .insert({
        vendedor_id: vendedorId,
        titulo: 'Casa publicada para el hallazgo del precio vaciable',
        descripcion: 'Descripcion suficiente para la prueba.',
        slug: `prueba-precio-vaciable-${Date.now().toString(36)}`,
        operacion: 'venta', tipo_inmueble: 'casa',
        precio: 200000000,
      })
      .select('id').single()
    expect(error).toBeNull()
    propiedadId = data!.id

    const { error: errorImagen } = await cliente.from('imagenes_propiedad').insert({
      propiedad_id: propiedadId,
      ruta_storage: 'prueba/imagen-precio-vaciable.webp',
      alt_text: 'Fachada de la casa publicada',
    })
    expect(errorImagen).toBeNull()

    const { error: errorPublicar } = await cliente
      .from('propiedades').update({ estado: 'publicada' }).eq('id', propiedadId).select()
    expect(errorPublicar).toBeNull()

    // Un BORRADOR aparte, con precio puesto, para el caso positivo de mas
    // abajo: vaciarle el precio a un borrador SI debe seguir funcionando
    // (esa es la decision de diseno de 20260907000100, y esta migracion no
    // la toca -- la condicion sigue siendo NEW.estado = 'publicada').
    const { data: datoBorrador, error: errorBorrador } = await cliente
      .from('propiedades')
      .insert({
        vendedor_id: vendedorId,
        titulo: 'Borrador con precio para vaciar despues',
        descripcion: 'Descripcion suficiente para la prueba.',
        slug: `prueba-borrador-precio-${Date.now().toString(36)}`,
        operacion: 'venta', tipo_inmueble: 'casa',
        precio: 100000000,
      })
      .select('id').single()
    expect(errorBorrador).toBeNull()
    borradorId = datoBorrador!.id
  })

  afterAll(async () => {
    await clienteAdmin().from('propiedades').delete().in('id', [propiedadId, borradorId])
  })

  it('vaciar el precio de una publicada (UPDATE que deja estado = publicada) es rechazado con 23514', async () => {
    const { error } = await cliente
      .from('propiedades').update({ precio: null }).eq('id', propiedadId).select()
    expect(error?.code).toBe('23514')

    const { data } = await clienteAdmin()
      .from('propiedades').select('precio, estado').eq('id', propiedadId).single()
    expect(data!.estado).toBe('publicada')
    expect(data!.precio).toBe(200000000)
  })

  it('CASO POSITIVO: vaciar el precio de un BORRADOR SI funciona', async () => {
    const { data, error } = await cliente
      .from('propiedades').update({ precio: null }).eq('id', borradorId).select('precio, estado')
    expect(error).toBeNull()
    expect(data![0].estado).toBe('borrador')
    expect(data![0].precio).toBeNull()
  })
})
