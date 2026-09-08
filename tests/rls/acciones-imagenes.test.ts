import { describe, it, expect, vi, beforeAll } from 'vitest'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, sesionVendedor } from './ayudantes'
import { BUCKET_PROPIEDADES } from '@/lib/imagenes/firmar'

// subirImagen/eliminarImagen/reordenarImagen dependen de crearClienteServidor()
// (cookies() de next/headers, solo resuelve dentro de una peticion real de
// Next). Se sustituye por el cliente autenticado que necesite cada prueba,
// igual que tests/rls/cambiar-estado.test.ts hace para cambiarEstado(). Este
// fichero no importa crearClienteAdmin (a diferencia de
// eliminar-propiedad.test.ts): acciones-imagenes.ts no lo usa, asi que no
// hace falta neutralizar 'server-only' para el.
let clienteActual: SupabaseClient

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => clienteActual,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { subirImagen, eliminarImagen, reordenarImagen } = await import(
  '@/app/(vendedor)/panel/propiedades/[id]/acciones-imagenes'
)

async function crearBorrador(cliente: SupabaseClient, vendedorId: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await cliente
    .from('propiedades')
    .insert({
      vendedor_id: vendedorId,
      titulo: 'Casa de prueba para acciones de imagenes',
      descripcion: 'Descripcion suficiente para la prueba.',
      // 'borrador' es el estado por defecto y el que pide el encargo: sin
      // foto ni precio todavia, propiedades_exigir_imagen/precio no aplican.
      slug: `prueba-imagenes-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      operacion: 'venta',
      tipo_inmueble: 'casa',
      ...extra,
    })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data!.id as string
}

async function listarCarpeta(ruta: string): Promise<string[]> {
  const { data } = await clienteAdmin().storage.from(BUCKET_PROPIEDADES).list(ruta)
  return (data ?? []).map((o) => o.name)
}

function archivoDePrueba(nombre: string, contenido: Buffer): File {
  // new Uint8Array(contenido) copia los bytes a un TypedArray respaldado por
  // un ArrayBuffer normal: el tipo de Buffer (ArrayBufferLike, que admite
  // SharedArrayBuffer) no es asignable a BlobPart tal cual segun lib.dom.d.ts.
  return new File([new Uint8Array(contenido)], nombre, { type: 'image/jpeg' })
}

function formularioDeSubida(propiedadId: string, altText: string, archivo: File): FormData {
  const fd = new FormData()
  fd.append('propiedad_id', propiedadId)
  fd.append('alt_text', altText)
  fd.append('archivo', archivo)
  return fd
}

describe('acciones de imagenes (contra Postgres y Storage reales)', () => {
  let clienteA: SupabaseClient
  let clienteB: SupabaseClient
  let idA: string
  let idB: string
  let propiedadA: string
  let propiedadB: string
  // JPEG real y minimo, generado con sharp (no un buffer arbitrario): tiene
  // que sobrevivir al pipeline REAL de procesarImagen (rotate + resize +
  // reencode a webp), lo mismo que produccion le hace a una foto de verdad.
  let contenidoJpeg: Buffer

  beforeAll(async () => {
    clienteA = await sesionVendedor()
    clienteB = await sesionVendedor()
    const { data: usuarioA } = await clienteA.auth.getUser()
    const { data: usuarioB } = await clienteB.auth.getUser()
    idA = usuarioA.user!.id
    idB = usuarioB.user!.id

    clienteActual = clienteA
    propiedadA = await crearBorrador(clienteA, idA)
    clienteActual = clienteB
    propiedadB = await crearBorrador(clienteB, idB)

    contenidoJpeg = await sharp({
      create: { width: 6, height: 6, channels: 3, background: { r: 180, g: 90, b: 40 } },
    }).jpeg().toBuffer()
  })

  describe('subirImagen', () => {
    it('CASO POSITIVO: el vendedor A sube una imagen a su propia propiedad, con ruta bajo su uid', async () => {
      clienteActual = clienteA
      const archivo = archivoDePrueba('fachada.jpg', contenidoJpeg)

      const r = await subirImagen({}, formularioDeSubida(propiedadA, 'Fachada de la casa de prueba', archivo))

      expect(r).toEqual({})

      const { data: filas, error } = await clienteAdmin()
        .from('imagenes_propiedad').select('ruta_storage, alt_text, orden').eq('propiedad_id', propiedadA)
      expect(error).toBeNull()
      expect(filas).toHaveLength(1)
      // La ruta generada empieza por el uid del vendedor: es lo que exige
      // storage_propiedades_escritura (RLS de Storage, SP0).
      expect(filas![0]!.ruta_storage.startsWith(`${idA}/${propiedadA}/`)).toBe(true)
      expect(filas![0]!.ruta_storage.endsWith('.webp')).toBe(true)
      expect(filas![0]!.alt_text).toBe('Fachada de la casa de prueba')

      // Y el archivo procesado existe DE VERDAD en el bucket (no solo la fila).
      const nombres = await listarCarpeta(`${idA}/${propiedadA}`)
      expect(nombres.length).toBeGreaterThan(0)
    })

    // La prueba que mas importa de esta tarea: un vendedor no puede colar
    // una imagen en la propiedad de otro. La ruta de Storage solo exige que
    // el primer segmento sea el UID del que sube (storage_propiedades_escritura
    // no sabe nada de propiedades), asi que la subida a Storage tiene exito;
    // lo que la detiene es imagenes_escritura_dueno al insertar la fila -- y
    // ese archivo, ya huerfano, se borra a mano dentro de subirImagen().
    it('el vendedor A NO puede subir una imagen a la propiedad del vendedor B: cero filas y archivo huerfano borrado', async () => {
      clienteActual = clienteA
      const archivo = archivoDePrueba('intruso.jpg', contenidoJpeg)

      const r = await subirImagen({}, formularioDeSubida(propiedadB, 'Intento de intrusion', archivo))

      expect(r.error).toBeTruthy()

      // Cero filas: ninguna imagen quedo registrada para la propiedad de B
      // a nombre de esta subida.
      const { data: filas } = await clienteAdmin()
        .from('imagenes_propiedad').select('id').eq('propiedad_id', propiedadB)
      expect(filas ?? []).toHaveLength(0)

      // Y el archivo que SI llego a subirse a Storage (bajo la carpeta de A,
      // no la de B) ya no esta: la limpieza del camino huerfano se ejecuto.
      const nombres = await listarCarpeta(`${idA}/${propiedadB}`)
      expect(nombres).toHaveLength(0)

      // Se pin ademas el codigo exacto que produce la denegacion (regla
      // global: cero filas no basta sin asertar el codigo o fijar el
      // positivo). El mismo INSERT que subirImagen intento, hecho a mano,
      // confirma 42501 -- exactamente la politica imagenes_escritura_dueno.
      const { error: errorDirecto } = await clienteA.from('imagenes_propiedad')
        .insert({ propiedad_id: propiedadB, ruta_storage: 'x/intruso.webp', alt_text: 'Intento directo' })
        .select()
      expect(errorDirecto?.code).toBe('42501')
    })
  })

  describe('eliminarImagen', () => {
    it('CASO POSITIVO: el vendedor A borra su propia imagen, y el archivo desaparece DE VERDAD del bucket', async () => {
      clienteActual = clienteA
      const archivo = archivoDePrueba('para-borrar.jpg', contenidoJpeg)
      const rSubida = await subirImagen({}, formularioDeSubida(propiedadA, 'Imagen que se va a borrar', archivo))
      expect(rSubida).toEqual({})

      const { data: fila } = await clienteAdmin()
        .from('imagenes_propiedad').select('id, ruta_storage').eq('propiedad_id', propiedadA)
        .order('creado_en', { ascending: false }).limit(1).single()
      const imagenId = fila!.id as string
      const ruta = fila!.ruta_storage as string

      const r = await eliminarImagen(imagenId, propiedadA)
      expect(r).toEqual({})

      const { data: filaTrasBorrar } = await clienteAdmin()
        .from('imagenes_propiedad').select('id').eq('id', imagenId)
      expect(filaTrasBorrar ?? []).toHaveLength(0)

      // No solo la fila: el archivo real ya no esta en el bucket.
      const carpeta = ruta.split('/').slice(0, -1).join('/')
      const nombreArchivo = ruta.split('/').pop()!
      const nombres = await listarCarpeta(carpeta)
      expect(nombres).not.toContain(nombreArchivo)
    })

    it('el vendedor B no puede borrar una imagen del vendedor A: cero filas y el archivo sigue en el bucket', async () => {
      clienteActual = clienteA
      const archivo = archivoDePrueba('protegida.jpg', contenidoJpeg)
      await subirImagen({}, formularioDeSubida(propiedadA, 'Imagen protegida de A', archivo))

      const { data: fila } = await clienteAdmin()
        .from('imagenes_propiedad').select('id, ruta_storage').eq('propiedad_id', propiedadA)
        .order('creado_en', { ascending: false }).limit(1).single()
      const imagenId = fila!.id as string
      const ruta = fila!.ruta_storage as string

      clienteActual = clienteB
      const r = await eliminarImagen(imagenId, propiedadA)
      expect(r.error).toBeTruthy()

      const { data: sigueViva } = await clienteAdmin()
        .from('imagenes_propiedad').select('id').eq('id', imagenId)
      expect(sigueViva).toHaveLength(1)

      const carpeta = ruta.split('/').slice(0, -1).join('/')
      const nombreArchivo = ruta.split('/').pop()!
      const nombres = await listarCarpeta(carpeta)
      expect(nombres).toContain(nombreArchivo)

      // Limpieza para no ensuciar las pruebas siguientes de este fichero.
      clienteActual = clienteA
      await eliminarImagen(imagenId, propiedadA)
    })
  })

  describe('reordenarImagen', () => {
    // Propiedad DEDICADA y vacia para cada prueba de este bloque, en vez de
    // reutilizar propiedadA: los bloques de arriba (subirImagen,
    // eliminarImagen) dejan sobre propiedadA imagenes reales con orden=0 que
    // no se limpian a proposito (documentan el estado normal tras un alta).
    // reordenarImagen() calcula "arriba"/"abajo" sobre el listado COMPLETO
    // de la propiedad ordenado por `orden`; con esas imagenes de fondo, un
    // empate de `orden` con las tres fixtures de esta prueba habria hecho el
    // indice de la vecina indeterminista y la prueba, fragil.
    async function propiedadVaciaDeA() {
      clienteActual = clienteA
      return crearBorrador(clienteA, idA)
    }

    async function crearTresImagenes(cliente: SupabaseClient, propiedadId: string) {
      const filas = [
        { propiedad_id: propiedadId, ruta_storage: `fixtures/orden-0-${Date.now()}.webp`, alt_text: 'Primera imagen de la propiedad', orden: 0 },
        { propiedad_id: propiedadId, ruta_storage: `fixtures/orden-1-${Date.now()}.webp`, alt_text: 'Segunda imagen de la propiedad', orden: 1 },
        { propiedad_id: propiedadId, ruta_storage: `fixtures/orden-2-${Date.now()}.webp`, alt_text: 'Tercera imagen de la propiedad', orden: 2 },
      ]
      const { data, error } = await cliente.from('imagenes_propiedad').insert(filas).select('id, orden').order('orden', { ascending: true })
      expect(error).toBeNull()
      return data as { id: string; orden: number }[]
    }

    it('CASO POSITIVO: el vendedor A intercambia el orden de dos imagenes suyas de forma atomica', async () => {
      const propiedad = await propiedadVaciaDeA()
      const [img0, img1, img2] = await crearTresImagenes(clienteA, propiedad)

      const r = await reordenarImagen(img1!.id, propiedad, 'arriba')
      expect(r).toEqual({})

      const { data: trasIntercambio } = await clienteAdmin()
        .from('imagenes_propiedad').select('id, orden').in('id', [img0!.id, img1!.id, img2!.id])
      const porId = new Map(trasIntercambio!.map((f) => [f.id, f.orden]))
      // img1 tenia orden 1, img0 tenia orden 0: al moverla "arriba" deben
      // quedar intercambiados, sin duplicados.
      expect(porId.get(img1!.id)).toBe(0)
      expect(porId.get(img0!.id)).toBe(1)
      expect(porId.get(img2!.id)).toBe(2)
      // Sin duplicados: tres imagenes, tres valores de orden distintos.
      expect(new Set(porId.values()).size).toBe(3)
    })

    // Publicada A PROPOSITO, y esto es lo delicado de la prueba (mismo
    // razonamiento que documenta tests/rls/imagenes.test.ts para su prueba
    // equivalente de UPDATE cruzado). Sobre un BORRADOR ajeno, el SELECT
    // inicial de reordenarImagen() ya devuelve la lista vacia para B --
    // ninguna politica de lectura le aplica -- y la funcion sale por el
    // camino de "posicion no encontrada" SIN LLEGAR A INVOCAR EL RPC. Esa
    // rama no dice nada sobre si intercambiar_orden_imagenes() en si esta
    // bien protegida. Publicada, imagenes_lectura_publica SI deja ver la
    // lista a B (como a cualquier autenticado) -- asi que la unica barrera
    // que le queda es imagenes_actualizacion_dueno dentro del RPC, que es
    // justo lo que esta prueba quiere medir. Verificado que la variante en
    // borrador NO ejercita el RPC: con propiedadVaciaDeA() en vez de esta,
    // reordenarImagen devuelve {} (no error) porque `posicion` da -1.
    it('el vendedor B no puede reordenar las imagenes del vendedor A (propiedad publicada): ningun orden cambia', async () => {
      clienteActual = clienteA
      const propiedad = await crearBorrador(clienteA, idA, { precio: 100000000 })
      const [img0, img1] = await crearTresImagenes(clienteA, propiedad)

      // propiedades_exigir_imagen/precio ya estan satisfechos (3 imagenes,
      // precio puesto): publicar de verdad, no simulado.
      const { error: errorPublicar } = await clienteAdmin()
        .from('propiedades').update({ estado: 'publicada' }).eq('id', propiedad)
      expect(errorPublicar).toBeNull()

      clienteActual = clienteB
      const r = await reordenarImagen(img1!.id, propiedad, 'arriba')
      expect(r.error).toBeTruthy()

      const { data: intacto } = await clienteAdmin()
        .from('imagenes_propiedad').select('id, orden').in('id', [img0!.id, img1!.id])
      const porId = new Map(intacto!.map((f) => [f.id, f.orden]))
      expect(porId.get(img0!.id)).toBe(0)
      expect(porId.get(img1!.id)).toBe(1)
    })

    // Confirma la afirmacion del comentario de arriba: sobre un BORRADOR
    // ajeno (invisible para B), reordenarImagen() no encuentra la imagen en
    // su propio listado y responde {} -- ni error ni cambio de estado, y sin
    // invocar el RPC. Documentado como comportamiento, no como descuido:
    // mismo patron que ya cubren las pruebas unitarias para "posicion no
    // encontrada" (acciones-imagenes.test.ts), aqui contra RLS real.
    it('sobre un borrador ajeno (invisible), reordenarImagen no encuentra la imagen y no cambia nada', async () => {
      const propiedad = await propiedadVaciaDeA()
      const [img0, img1] = await crearTresImagenes(clienteA, propiedad)

      clienteActual = clienteB
      const r = await reordenarImagen(img1!.id, propiedad, 'arriba')
      expect(r).toEqual({})

      const { data: intacto } = await clienteAdmin()
        .from('imagenes_propiedad').select('id, orden').in('id', [img0!.id, img1!.id])
      const porId = new Map(intacto!.map((f) => [f.id, f.orden]))
      expect(porId.get(img0!.id)).toBe(0)
      expect(porId.get(img1!.id)).toBe(1)
    })

    // Hallazgo de la revision de esta tarea: intercambiar_orden_imagenes()
    // solo verificaba, fila por fila, que RLS dejara ver/editar cada imagen
    // (imagenes_actualizacion_dueno) -- nunca que las dos pertenecieran a la
    // MISMA propiedad. Un vendedor dueno de DOS propiedades distintas pasa
    // ambos chequeos de RLS con una imagen de cada una, y el intercambio
    // tenia exito cruzando propiedades: exactamente el orden
    // indeterminado/duplicado que esta funcion existe para evitar, solo que
    // reabierto por otra via.
    //
    // reordenarImagen() (el server action) NUNCA arma ese par -- la "vecina"
    // sale siempre de la lista ya filtrada por propiedad_id -- asi que el
    // producto no lo dispara. El vector real es invocar el RPC directamente,
    // que cualquier authenticated puede hacer via PostgREST (GRANT EXECUTE
    // ... TO authenticated). Por eso estas dos pruebas llaman a
    // clienteA.rpc(...) en vez de a reordenarImagen(): es la unica forma de
    // ejercitar el par cruzado que el hallazgo describe.
    it('el mismo vendedor NO puede intercambiar el orden entre imagenes de DOS propiedades suyas distintas', async () => {
      const propiedadX = await propiedadVaciaDeA()
      const propiedadY = await propiedadVaciaDeA()
      const [imgX] = await crearTresImagenes(clienteA, propiedadX)
      const [imgY] = await crearTresImagenes(clienteA, propiedadY)

      const { error } = await clienteA.rpc('intercambiar_orden_imagenes', {
        p_imagen_id_1: imgX!.id,
        p_imagen_id_2: imgY!.id,
      })

      // Regla global: cero cambios no basta sin fijar el codigo exacto.
      expect(error?.code).toBe('42501')

      const { data: intacto } = await clienteAdmin()
        .from('imagenes_propiedad').select('id, orden').in('id', [imgX!.id, imgY!.id])
      const porId = new Map(intacto!.map((f) => [f.id, f.orden]))
      expect(porId.get(imgX!.id)).toBe(0)
      expect(porId.get(imgY!.id)).toBe(0)
    })

    it('CASO POSITIVO: el RPC intercambia el orden de dos imagenes de la MISMA propiedad', async () => {
      const propiedad = await propiedadVaciaDeA()
      const [img0, img1] = await crearTresImagenes(clienteA, propiedad)

      const { error } = await clienteA.rpc('intercambiar_orden_imagenes', {
        p_imagen_id_1: img0!.id,
        p_imagen_id_2: img1!.id,
      })
      expect(error).toBeNull()

      const { data: trasIntercambio } = await clienteAdmin()
        .from('imagenes_propiedad').select('id, orden').in('id', [img0!.id, img1!.id])
      const porId = new Map(trasIntercambio!.map((f) => [f.id, f.orden]))
      expect(porId.get(img0!.id)).toBe(1)
      expect(porId.get(img1!.id)).toBe(0)
    })
  })
})
