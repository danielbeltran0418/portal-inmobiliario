import { describe, it, expect, vi, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, sesionVendedor } from './ayudantes'
import { BUCKET_PROPIEDADES } from '@/lib/imagenes/firmar'

// eliminarPropiedad() depende de crearClienteServidor() (cookies() de
// next/headers) y de crearClienteAdmin() (import 'server-only', que revienta
// bajo Node/Vitest sin la condicion "react-server" de Next -- ver el
// comentario de tests/unit/accion-propiedades.test.ts). Se sustituyen ambos
// por clientes reales apuntando a la pila local de Supabase: el de vendedor
// cambia de sesion segun la prueba (igual que imagenes-firmadas.test.ts), y
// el admin es SIEMPRE el service_role real de ayudantes.ts -- exactamente el
// que usaria produccion, solo que sin pasar por 'server-only'. Lo que se
// ejercita es el codigo REAL de drenarLimpieza() contra Storage de verdad,
// no una reescritura suya.
let clienteActual: SupabaseClient

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => clienteActual,
}))
vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => clienteAdmin(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { eliminarPropiedad } = await import('@/app/(vendedor)/panel/propiedades/acciones')

async function crearBorrador(cliente: SupabaseClient, vendedorId: string) {
  const { data, error } = await cliente
    .from('propiedades')
    .insert({
      vendedor_id: vendedorId,
      titulo: 'Casa de prueba para eliminarPropiedad',
      descripcion: 'Descripcion suficiente para la prueba.',
      slug: `prueba-eliminar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      operacion: 'venta',
      tipo_inmueble: 'casa',
      precio: 100000000,
    })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data!.id as string
}

async function objetoExisteEnBucket(ruta: string): Promise<boolean> {
  const partes = ruta.split('/')
  const nombre = partes.pop()!
  const carpeta = partes.join('/')
  const { data } = await clienteAdmin().storage.from(BUCKET_PROPIEDADES).list(carpeta)
  return (data ?? []).some((o) => o.name === nombre)
}

describe('eliminarPropiedad: drena la cola de limpieza de Storage de verdad', () => {
  it('borra la propiedad, y el archivo real deja de existir en el bucket (no solo la fila)', async () => {
    const cliente = await sesionVendedor()
    clienteActual = cliente
    const { data: usuario } = await cliente.auth.getUser()
    const vendedorId = usuario.user!.id

    const propiedadId = await crearBorrador(cliente, vendedorId)

    const ruta = `${vendedorId}/eliminar-prueba-${Date.now()}.webp`
    const { error: errorSubida } = await clienteAdmin().storage
      .from(BUCKET_PROPIEDADES)
      .upload(ruta, new TextEncoder().encode('contenido real de prueba'), {
        contentType: 'image/webp',
      })
    expect(errorSubida).toBeNull()

    const { error: errorImagen } = await cliente.from('imagenes_propiedad').insert({
      propiedad_id: propiedadId,
      ruta_storage: ruta,
      alt_text: 'Fachada de la casa que se va a borrar',
    })
    expect(errorImagen).toBeNull()

    // Control positivo antes de borrar: el archivo esta de verdad en el
    // bucket. Sin esto, "ya no esta" podria ser porque nunca llego a subirse.
    expect(await objetoExisteEnBucket(ruta)).toBe(true)

    const r = await eliminarPropiedad(propiedadId)
    expect(r).toEqual({})

    // La fila ya no esta (leido con service_role, que salta RLS).
    const { data: propiedadEnBase } = await clienteAdmin()
      .from('propiedades').select('id').eq('id', propiedadId)
    expect(propiedadEnBase ?? []).toHaveLength(0)

    // El CASCADE se llevo la imagen por delante.
    const { data: imagenEnBase } = await clienteAdmin()
      .from('imagenes_propiedad').select('id').eq('propiedad_id', propiedadId)
    expect(imagenEnBase ?? []).toHaveLength(0)

    // El punto entero de la cola: el archivo real ya no esta en Storage.
    expect(await objetoExisteEnBucket(ruta)).toBe(false)

    // Y la cola ya no tiene la ruta pendiente: drenarLimpieza() la quito
    // despues de confirmar el borrado en Storage.
    const { data: enCola } = await clienteAdmin()
      .from('limpieza_almacenamiento').select('id').eq('ruta', ruta)
    expect(enCola ?? []).toHaveLength(0)
  })
})

describe('eliminarPropiedad: un vendedor no puede borrar la propiedad de otro', () => {
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
    propiedadDeA = await crearBorrador(clienteA, idA)
  })

  it('el vendedor B no puede borrar la propiedad del vendedor A: cero filas y dato intacto', async () => {
    clienteActual = clienteB

    const r = await eliminarPropiedad(propiedadDeA)

    // RLS (propiedades_borrado_dueno) filtra la fila antes del DELETE: cero
    // filas afectadas, error nulo del lado de PostgREST. eliminarPropiedad lo
    // traduce en el mensaje generico -- lo que importa es que la fila SIGUE
    // ahi, comprobado con service_role.
    expect(r.error).toBeTruthy()

    const { data: enBase } = await clienteAdmin()
      .from('propiedades').select('id, vendedor_id').eq('id', propiedadDeA)
    expect(enBase).toHaveLength(1)
    expect(enBase![0]!.vendedor_id).toBe(idA)
  })

  it('CASO POSITIVO en la misma suite: el vendedor A (el dueno) SI puede borrar su propia propiedad', async () => {
    clienteActual = clienteA

    const r = await eliminarPropiedad(propiedadDeA)

    expect(r).toEqual({})
    const { data: enBase } = await clienteAdmin()
      .from('propiedades').select('id').eq('id', propiedadDeA)
    expect(enBase ?? []).toHaveLength(0)
  })
})
