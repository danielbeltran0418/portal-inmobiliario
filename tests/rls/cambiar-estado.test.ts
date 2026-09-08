import { describe, it, expect, vi, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, sesionVendedor } from './ayudantes'

// cambiarEstado() depende de crearClienteServidor() (cookies() de
// next/headers, solo resuelve dentro de una peticion real de Next). Se
// sustituye por el cliente autenticado que necesite cada prueba, igual que
// hace tests/rls/imagenes-firmadas.test.ts para firmarImagenes(). El resto
// de la funcion -- la comprobacion previa de foto/precio, el UPDATE, el uso
// de mapearError -- es el codigo REAL, ejecutado contra la pila local de
// Supabase y su RLS de verdad.
let clienteActual: SupabaseClient

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => clienteActual,
}))
// cambiarEstado() no llama a crearClienteAdmin (eso es cosa de
// eliminarPropiedad), pero acciones.ts SI la importa a nivel de modulo, y esa
// importacion arrastra 'server-only', que revienta bajo Node/Vitest en
// cuanto se carga el fichero. Sin este mock, importar acciones.ts mas abajo
// tira abajo TODA esta suite antes de que corra una sola prueba.
vi.mock('@/lib/supabase/cliente-admin', () => ({ crearClienteAdmin: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { cambiarEstado } = await import('@/app/(vendedor)/panel/propiedades/acciones')

async function crearBorrador(cliente: SupabaseClient, vendedorId: string, extra = {}) {
  const { data, error } = await cliente
    .from('propiedades')
    .insert({
      vendedor_id: vendedorId,
      titulo: 'Casa de prueba para cambiarEstado',
      descripcion: 'Descripcion suficiente para la prueba.',
      slug: `prueba-cambiar-estado-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      operacion: 'venta',
      tipo_inmueble: 'casa',
      ...extra,
    })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data!.id as string
}

// El defecto que corrigio esta tarea: el brief original mandaba mapear 23514
// -> "necesitas una foto" a ciegas, pero hay DOS triggers que lanzan ese
// mismo codigo (propiedades_exigir_imagen y propiedades_exigir_precio).
// cambiarEstado() evita la ambiguedad consultando la fila real ANTES del
// UPDATE, asi que estas pruebas ejercitan el codigo REAL contra Postgres de
// verdad, no una reescritura suya.
describe('cambiarEstado: distingue foto de precio (defecto del brief original)', () => {
  it('sin fotos (con precio puesto), el mensaje es el de la foto', async () => {
    const cliente = await sesionVendedor()
    clienteActual = cliente
    const { data: usuario } = await cliente.auth.getUser()
    const propiedadId = await crearBorrador(cliente, usuario.user!.id, { precio: 100000000 })

    const r = await cambiarEstado(propiedadId, 'publicada')

    expect(r.error).toBe('Para publicar necesitas subir al menos una foto de la propiedad.')

    const { data: enBase } = await clienteAdmin()
      .from('propiedades').select('estado').eq('id', propiedadId).single()
    expect(enBase!.estado).toBe('borrador')
  })

  it('con fotos pero sin precio, el mensaje es el de precio, no el de foto', async () => {
    const cliente = await sesionVendedor()
    clienteActual = cliente
    const { data: usuario } = await cliente.auth.getUser()
    // precio se omite: nace NULL, como un borrador real (20260907000100).
    const propiedadId = await crearBorrador(cliente, usuario.user!.id)

    const { error: errorImagen } = await cliente.from('imagenes_propiedad').insert({
      propiedad_id: propiedadId,
      ruta_storage: 'prueba-cambiar-estado/imagen.webp',
      alt_text: 'Fachada de la casa de prueba',
    })
    expect(errorImagen).toBeNull()

    const r = await cambiarEstado(propiedadId, 'publicada')

    expect(r.error).toBe('Para publicar necesitas fijar un precio para la propiedad.')

    const { data: enBase } = await clienteAdmin()
      .from('propiedades').select('estado').eq('id', propiedadId).single()
    expect(enBase!.estado).toBe('borrador')
  })

  // Decision documentada en acciones.ts (faltaParaPublicar): si faltan las
  // dos cosas se avisa de la foto primero, igual que en la base (los
  // triggers BEFORE se ejecutan en orden alfabetico de nombre).
  it('CASO POSITIVO ademas del negativo: si faltan foto Y precio, se muestra el mensaje de la foto', async () => {
    const cliente = await sesionVendedor()
    clienteActual = cliente
    const { data: usuario } = await cliente.auth.getUser()
    const propiedadId = await crearBorrador(cliente, usuario.user!.id)

    const r = await cambiarEstado(propiedadId, 'publicada')

    expect(r.error).toBe('Para publicar necesitas subir al menos una foto de la propiedad.')
  })

  it('CASO POSITIVO: con foto y precio, publicar SI funciona', async () => {
    const cliente = await sesionVendedor()
    clienteActual = cliente
    const { data: usuario } = await cliente.auth.getUser()
    const propiedadId = await crearBorrador(cliente, usuario.user!.id, { precio: 100000000 })

    const { error: errorImagen } = await cliente.from('imagenes_propiedad').insert({
      propiedad_id: propiedadId,
      ruta_storage: 'prueba-cambiar-estado/completa.webp',
      alt_text: 'Fachada de la casa completa',
    })
    expect(errorImagen).toBeNull()

    const r = await cambiarEstado(propiedadId, 'publicada')

    expect(r).toEqual({})
    const { data: enBase } = await clienteAdmin()
      .from('propiedades').select('estado').eq('id', propiedadId).single()
    expect(enBase!.estado).toBe('publicada')
  })
})

describe('cambiarEstado: transiciones sin requisito de publicacion', () => {
  it('pausar y marcar vendida funcionan sin foto ni precio', async () => {
    const cliente = await sesionVendedor()
    clienteActual = cliente
    const { data: usuario } = await cliente.auth.getUser()
    const propiedadId = await crearBorrador(cliente, usuario.user!.id)

    const rPausar = await cambiarEstado(propiedadId, 'pausada')
    expect(rPausar).toEqual({})

    const rVendida = await cambiarEstado(propiedadId, 'vendida')
    expect(rVendida).toEqual({})

    const { data: enBase } = await clienteAdmin()
      .from('propiedades').select('estado').eq('id', propiedadId).single()
    expect(enBase!.estado).toBe('vendida')
  })
})

describe('cambiarEstado: un vendedor no puede cambiar el estado de la propiedad de otro', () => {
  let idA = ''
  let clienteA: SupabaseClient
  let clienteB: SupabaseClient
  let propiedadDeA = ''

  beforeAll(async () => {
    clienteA = await sesionVendedor()
    clienteB = await sesionVendedor()
    const { data: usuarioA } = await clienteA.auth.getUser()
    idA = usuarioA.user!.id

    clienteActual = clienteA
    propiedadDeA = await crearBorrador(clienteA, idA, { precio: 100000000 })
  })

  it('el vendedor B no puede cambiar el estado de la propiedad del vendedor A: cero filas y dato intacto', async () => {
    clienteActual = clienteB

    const r = await cambiarEstado(propiedadDeA, 'pausada')

    // RLS (propiedades_actualizacion_dueno) filtra la fila antes del UPDATE:
    // 0 filas afectadas, error nulo del lado de PostgREST. cambiarEstado lo
    // traduce en el mensaje generico -- lo que importa aqui es que la fila
    // NO cambio, comprobado leyendo con service_role (salta RLS).
    expect(r.error).toBeTruthy()

    const { data: enBase } = await clienteAdmin()
      .from('propiedades').select('estado, vendedor_id').eq('id', propiedadDeA).single()
    expect(enBase!.estado).toBe('borrador')
    expect(enBase!.vendedor_id).toBe(idA)
  })

  it('CASO POSITIVO en la misma suite: el vendedor A (el dueno) SI puede cambiar su propio estado', async () => {
    clienteActual = clienteA

    const r = await cambiarEstado(propiedadDeA, 'pausada')

    expect(r).toEqual({})
    const { data: enBase } = await clienteAdmin()
      .from('propiedades').select('estado').eq('id', propiedadDeA).single()
    expect(enBase!.estado).toBe('pausada')
  })
})
