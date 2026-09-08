'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { mapearError, MENSAJE_GENERICO } from '@/lib/errores/mapear'
import { BUCKET_PROPIEDADES } from '@/lib/imagenes/firmar'
import {
  procesarImagen, TIPOS_ACEPTADOS, TAMANO_MAXIMO_BYTES, MAXIMO_IMAGENES_POR_PROPIEDAD,
} from '@/lib/imagenes/procesar'

export interface EstadoImagen { error?: string }

export async function subirImagen(
  _estado: EstadoImagen,
  formData: FormData,
): Promise<EstadoImagen> {
  const propiedadId = String(formData.get('propiedad_id') ?? '')
  const altText = String(formData.get('alt_text') ?? '').trim()
  const archivo = formData.get('archivo')

  if (!propiedadId || !(archivo instanceof File) || archivo.size === 0) {
    return { error: 'Elige una imagen.' }
  }
  if (altText.length < 5) {
    return { error: 'Describe la foto en al menos 5 caracteres.' }
  }
  // Validar ANTES de procesar: no gastar CPU en algo que se va a rechazar.
  if (!TIPOS_ACEPTADOS.includes(archivo.type as (typeof TIPOS_ACEPTADOS)[number])) {
    return { error: 'Solo se aceptan imagenes JPG, PNG o WebP.' }
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return { error: 'La imagen supera los 5 MB.' }
  }

  const supabase = await crearClienteServidor()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario.user) return { error: MENSAJE_GENERICO }

  // RIESGO 2 (ver task-10-report.md): esta lectura y el INSERT de abajo no
  // son atomicos. Entre los dos cabe otra subida del mismo vendedor en otra
  // pestana, y la propiedad podria terminar con 13 imagenes en vez de 12 (o,
  // si las dos calculan el mismo `orden` a la vez, un choque que el UNIQUE
  // (propiedad_id, orden) -- ver 20260908000300 -- convierte en un error en
  // vez de un duplicado silencioso). Aceptado a proposito, sin trigger que lo
  // cierre: la consecuencia de pasarse de 12 es COSMETICA (una foto de mas en
  // el carrusel), nunca de seguridad ni de integridad -- no hay fila ajena de
  // por medio, y el propio vendedor puede borrar el sobrante con
  // eliminarImagen() de inmediato. Cerrar esta carrera con un trigger de
  // conteo en la base anadiria una segunda fuente de verdad para "cuantas
  // fotos tiene esta propiedad" (la primera es este SELECT) por un beneficio
  // que es solo estetico.
  //
  // Hallazgo Importante de la revision final de rama: el codigo anterior
  // reutilizaba este mismo conteo como `orden` del INSERT de abajo
  // (`orden: count ?? 0`). Eso es correcto la PRIMERA vez que se llena una
  // propiedad (0, 1, 2, ...) pero se rompe en cuanto se borra algo del medio:
  // subir 3 fotos (orden 0, 1, 2), borrar la del medio (quedan 0 y 2, cuenta
  // = 2) y subir una nueva reutiliza `orden: 2` -- EMPATE con la que ya
  // tenia ese valor. Con el empate, reordenarImagen() puede elegir como
  // "vecina" a su propia gemela e intercambiar_orden_imagenes() cambia 2 por
  // 2: un no-op silencioso, Subir/Bajar deja de mover nada y el vendedor no
  // recibe ningun error. Se selecciona el `orden` real de las filas
  // existentes en vez de derivarlo del conteo: `max(orden) + 1` no puede
  // colisionar con ninguna fila que ya exista, sea cual sea el hueco dejado
  // por un borrado anterior.
  const { data: existentes } = await supabase
    .from('imagenes_propiedad')
    .select('orden')
    .eq('propiedad_id', propiedadId)

  const cantidadActual = existentes?.length ?? 0
  if (cantidadActual >= MAXIMO_IMAGENES_POR_PROPIEDAD) {
    return { error: `Maximo ${MAXIMO_IMAGENES_POR_PROPIEDAD} fotos por propiedad.` }
  }

  const siguienteOrden = cantidadActual === 0
    ? 0
    : Math.max(...existentes!.map((img) => img.orden)) + 1

  let procesada: Buffer
  try {
    procesada = await procesarImagen(Buffer.from(await archivo.arrayBuffer()))
  } catch {
    return { error: 'No pudimos procesar esa imagen. Prueba con otra.' }
  }

  // La ruta DEBE empezar por el uid: es lo que exige la politica
  // storage_propiedades_escritura de SP0.
  const ruta = `${usuario.user.id}/${propiedadId}/${randomUUID()}.webp`

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET_PROPIEDADES)
    .upload(ruta, procesada, { contentType: 'image/webp' })

  if (errorSubida) { mapearError(errorSubida); return { error: MENSAJE_GENERICO } }

  const { error: errorFila } = await supabase.from('imagenes_propiedad').insert({
    propiedad_id: propiedadId, ruta_storage: ruta, alt_text: altText, orden: siguienteOrden,
  })

  // Si la fila no entra -- por ejemplo, RIESGO 1 de seguridad real:
  // propiedadId no es del vendedor autenticado, y imagenes_escritura_dueno
  // (RLS) rechaza el INSERT con 42501 -- el archivo ya subido a Storage
  // quedaria huerfano SIN registro en la cola de limpieza (esa cola se
  // alimenta al BORRAR una fila de imagenes_propiedad, y aqui nunca hubo
  // fila). Se borra a mano en este camino, no se deja para el drenado.
  if (errorFila) {
    await supabase.storage.from(BUCKET_PROPIEDADES).remove([ruta])
    mapearError(errorFila)
    return { error: MENSAJE_GENERICO }
  }

  revalidatePath(`/panel/propiedades/${propiedadId}`)
  return {}
}

export async function eliminarImagen(imagenId: string, propiedadId: string): Promise<EstadoImagen> {
  const supabase = await crearClienteServidor()

  const { data, error } = await supabase
    .from('imagenes_propiedad').delete().eq('id', imagenId).select('ruta_storage')

  if (error) { mapearError(error); return { error: MENSAJE_GENERICO } }
  // RLS deniega filtrando filas: cero filas significa "no es tuya".
  if (!data || data.length === 0) return { error: MENSAJE_GENERICO }

  // El trigger imagenes_encolar_limpieza (20260904000400) ya anoto la ruta
  // en limpieza_almacenamiento en cuanto el DELETE de arriba se confirmo. Se
  // intenta borrar el archivo aqui, con el cliente del propio vendedor
  // (storage_propiedades_borrado se lo permite, es su propia carpeta); si
  // esta llamada fallara, la ruta ya anotada queda pendiente para el
  // proximo drenado de eliminarPropiedad() -- basura acumulada, nunca un
  // archivo perdido sin registro de que falta borrarlo.
  await supabase.storage.from(BUCKET_PROPIEDADES).remove([data[0]!.ruta_storage])

  revalidatePath(`/panel/propiedades/${propiedadId}`)
  return {}
}

/**
 * RIESGO 1 (ver task-10-report.md): el brief original intercambiaba el
 * `orden` de dos filas con DOS UPDATE independientes desde aqui, cada uno su
 * propia llamada a PostgREST. Si el primero se confirmaba y el segundo
 * fallaba, las dos imagenes quedaban con el mismo `orden` -- el listado se
 * volvia indeterminista sin que nada lo pudiera deshacer.
 *
 * Se resolvio en la base, no aqui: intercambiar_orden_imagenes()
 * (migracion 20260908000100) hace el swap dentro de una unica funcion, que
 * para PostgREST es una unica sentencia -- y por tanto una unica
 * transaccion. O se mueven las dos filas, o no se mueve ninguna. La funcion
 * es SECURITY INVOKER: sigue sujeta a imagenes_actualizacion_dueno /
 * imagenes_actualizacion_super_admin, exactamente la misma RLS que ya
 * protegia el diseno de dos UPDATE. Ver el comentario de cabecera de esa
 * migracion para el resto del razonamiento (SELECT ... FOR UPDATE,
 * GET DIAGNOSTICS, por que SECURITY INVOKER y no DEFINER).
 */
export async function reordenarImagen(
  imagenId: string,
  propiedadId: string,
  direccion: 'arriba' | 'abajo',
): Promise<EstadoImagen> {
  const supabase = await crearClienteServidor()

  const { data: imagenes } = await supabase
    .from('imagenes_propiedad')
    .select('id, orden')
    .eq('propiedad_id', propiedadId)
    .order('orden', { ascending: true })

  if (!imagenes) return { error: MENSAJE_GENERICO }

  const posicion = imagenes.findIndex((i) => i.id === imagenId)
  const destino = direccion === 'arriba' ? posicion - 1 : posicion + 1
  // posicion < 0: la imagen no aparece en el listado de esta propiedad (no
  // es tuya, o el id no existe). destino fuera de rango: ya esta en el
  // extremo correspondiente. Ninguno de los dos es un error del usuario;
  // no hay nada que mover.
  if (posicion < 0 || destino < 0 || destino >= imagenes.length) return {}

  const actual = imagenes[posicion]!
  const vecina = imagenes[destino]!

  const { error } = await supabase.rpc('intercambiar_orden_imagenes', {
    p_imagen_id_1: actual.id,
    p_imagen_id_2: vecina.id,
  })

  if (error) { mapearError(error); return { error: MENSAJE_GENERICO } }

  revalidatePath(`/panel/propiedades/${propiedadId}`)
  return {}
}
