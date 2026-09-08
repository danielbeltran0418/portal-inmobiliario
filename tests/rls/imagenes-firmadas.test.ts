import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, sesionVendedor } from './ayudantes'

// firmarImagenes() llama a crearClienteServidor(), que depende de cookies() de
// next/headers -- solo resuelve dentro de una peticion real de Next. Aqui se
// sustituye por el cliente autenticado que la prueba necesite en cada momento,
// para ejercitar la funcion REAL (no una reescritura suya) contra la pila de
// Supabase real y su RLS. El resto de la firma (BUCKET_PROPIEDADES, el uso de
// createSignedUrls, el Map de salida) es exactamente el que corre en produccion.
let clienteActual: SupabaseClient

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => clienteActual,
}))

const { firmarImagenes, BUCKET_PROPIEDADES } = await import('@/lib/imagenes/firmar')

describe('firmarImagenes', () => {
  let clienteA: SupabaseClient
  let clienteB: SupabaseClient
  let idA: string
  let ruta: string
  const contenido = 'contenido real de la imagen para la prueba de firma'

  beforeAll(async () => {
    clienteA = await sesionVendedor()
    clienteB = await sesionVendedor()
    const { data: usuarioA } = await clienteA.auth.getUser()
    idA = usuarioA.user!.id

    ruta = `${idA}/firmada.webp`
    const { error } = await clienteAdmin()
      .storage.from(BUCKET_PROPIEDADES)
      .upload(ruta, new TextEncoder().encode(contenido), { contentType: 'image/webp', upsert: true })
    expect(error).toBeNull()
  })

  afterAll(async () => {
    await clienteAdmin().storage.from(BUCKET_PROPIEDADES).remove([ruta])
  })

  it('CASO POSITIVO: el vendedor dueno firma su propia imagen y la URL sirve el archivo', async () => {
    clienteActual = clienteA
    const resultado = await firmarImagenes([ruta])

    expect(resultado.size).toBe(1)
    const url = resultado.get(ruta)
    expect(url).toBeTruthy()

    const respuesta = await fetch(url!)
    expect(respuesta.ok).toBe(true)
    expect(await respuesta.text()).toBe(contenido)
  })

  // El caso que de verdad importa: un vendedor NO puede usar firmarImagenes
  // para sacar la imagen de otro vendedor.
  //
  // Averiguado empiricamente (ver el experimento contra la pila local antes de
  // escribir esta prueba): createSignedUrls() es un batch call cuyo `error` de
  // nivel superior queda en null aunque una de las rutas falle -- el fallo va
  // por entrada, en `data[i].error` ("Either the object does not exist or you
  // do not have access to it"), con `data[i].signedUrl` en null para esa
  // entrada. La politica storage_propiedades_lectura (RLS sobre
  // storage.objects, solo (storage.foldername(name))[1] = auth.uid()) se
  // aplica en el momento de FIRMAR, no solo en el momento de descargar: para
  // Storage, la fila de otro vendedor sencillamente "no existe" bajo el JWT de
  // B, asi que no hay nada que firmar. El bucle de firmarImagenes() solo mete
  // en el Map las entradas con signedUrl no nulo, asi que la ruta ajena queda
  // fuera del resultado sin que la funcion necesite ningun chequeo adicional.
  //
  // No es el caso (verificado en el mismo experimento) de que se emita una
  // firma y la denegacion aparezca recien en el fetch: aqui no llega a haber
  // firma. Si esto cambiara -- por ejemplo, si createSignedUrls empezara a
  // devolver una URL utilizable para la ruta ajena -- serIa un hallazgo grave
  // de escalamiento de privilegios sobre fotos de otro vendedor, y esta
  // prueba lo detectaria: resultado.size seria 1 en vez de 0.
  it('el vendedor B NO puede firmar la imagen del vendedor A', async () => {
    clienteActual = clienteB
    const resultado = await firmarImagenes([ruta])

    expect(resultado.size).toBe(0)
    expect(resultado.has(ruta)).toBe(false)
  })

  // El brief hace que firmarImagenes() devuelva un Map vacio ante error en vez
  // de lanzar (la imagen es accesoria; el panel debe seguir siendo usable).
  // Esto fija esa decision como comportamiento, no como descuido: una ruta que
  // no existe en el bucket produce el mismo patron por-entrada que el caso de
  // arriba (error en `data[i].error`, `signedUrl` null, `error` de nivel
  // superior en null) y firmarImagenes() no lanza -- devuelve un Map vacio.
  it('una ruta inexistente no lanza: firmarImagenes devuelve un Map vacio', async () => {
    clienteActual = clienteA
    const resultado = await firmarImagenes([`${idA}/no-existe-de-verdad.webp`])

    expect(resultado.size).toBe(0)
  })
})
