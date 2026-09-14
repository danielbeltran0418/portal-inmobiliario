'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
import { esquemaPropiedad, esquemaPropiedadNueva, type DatosPropiedad } from '@/lib/validacion/esquemas'
import {
  mapearError,
  MENSAJE_GENERICO,
  MENSAJE_SIN_FOTOS,
  MENSAJE_SIN_PRECIO,
} from '@/lib/errores/mapear'
import { generarSlug } from '@/lib/propiedades/slug'
import { BUCKET_PROPIEDADES } from '@/lib/imagenes/firmar'

export interface EstadoPropiedad {
  error?: string
  errores?: Record<string, string>
}

const INTENTOS_DE_SLUG = 3

export async function crearBorrador(
  _estado: EstadoPropiedad,
  formData: FormData,
): Promise<EstadoPropiedad> {
  const analisis = esquemaPropiedadNueva.safeParse({ titulo: formData.get('titulo') })
  if (!analisis.success) {
    return { errores: { titulo: analisis.error.issues[0]!.message } }
  }

  const supabase = await crearClienteServidor()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario.user) redirect('/login')

  let id: string | null = null

  // 4 hex dan 65.536 combinaciones y slug es UNIQUE: la colision es improbable
  // pero posible. 23505 = unique_violation. generarSlug se llama SIN sufijo
  // propio: si se le pasara uno mal formado, generarSlug lanza (ver slug.ts).
  for (let intento = 0; intento < INTENTOS_DE_SLUG && !id; intento++) {
    const { data, error } = await supabase
      .from('propiedades')
      .insert({
        vendedor_id: usuario.user.id,
        titulo: analisis.data.titulo,
        slug: generarSlug(analisis.data.titulo),
        descripcion: '',
        operacion: 'venta',
        tipo_inmueble: 'apartamento',
        // precio se omite: la migracion 20260907000100 quito su NOT NULL
        // exactamente para esto. Un borrador recien creado GENUINAMENTE no
        // tiene precio todavia; forzar un marcador (antes: `precio: 1`) para
        // satisfacer un NOT NULL era la causa de que faltantesParaPublicar
        // (src/lib/propiedades/completitud.ts) lo diera por puesto -- 1 es
        // positivo, pasa "!p.precio || p.precio <= 0" sin ser un precio real.
        // El trigger propiedades_exigir_precio impide publicar mientras siga
        // en NULL, igual que propiedades_exigir_imagen exige una foto.
      })
      .select('id')
      .single()

    if (!error) { id = data!.id; break }
    if (error.code !== '23505') {
      mapearError(error)
      return { error: MENSAJE_GENERICO }
    }
  }

  if (!id) return { error: MENSAJE_GENERICO }

  revalidatePath('/panel')
  redirect(`/panel/propiedades/${id}`)
}

// Los CINCO campos opcionales de esquemaPropiedad que siguen viviendo en
// `propiedades` (precio se unio al grupo en la correccion del hallazgo "un
// borrador no se puede guardar sin precio"): vacio ('', ' ' o null) se
// normaliza a `undefined` en la VALIDACION -- eso no cambia, sigue
// significando "sin dato" -- pero enviar la clave con `undefined` al UPDATE
// de PostgREST equivale a NO enviarla: JSON.stringify omite las claves
// `undefined`, asi que PostgREST deja esa columna INTACTA en vez de
// vaciarla. Ver paraElUpdate() mas abajo, que es donde se corrige -- aqui
// solo se declara la lista de campos a los que aplica.
//
// `direccion` YA NO esta aqui: desde 20260914000100 vive en
// propiedades_ubicacion, no en propiedades, y se escribe aparte con un
// upsert (ver actualizarPropiedad). El mismo vaciado-a-NULL explicito que
// corrige este arreglo para los cinco de abajo se replica ahi con
// `direccion ?? null`.
const CAMPOS_OPCIONALES_ANULABLES: readonly (keyof Omit<DatosPropiedad, 'direccion'>)[] = [
  'precio', 'habitaciones', 'banos', 'area_m2', 'barrio_id',
]

/**
 * Hallazgo Importante de la revision final de rama: un campo opcional
 * vaciado por el vendedor (por ejemplo, borrar toda la "Direccion" y
 * guardar) no se podia realmente vaciar. `esquemaPropiedad.parse()` ya hace
 * lo correcto en la VALIDACION -- normaliza '', ' ' y null a `undefined`,
 * que sigue significando "sin dato" -- pero `analisis.data` con esa clave en
 * `undefined` se pasaba tal cual a `.update()`. Supabase-js construye el
 * cuerpo de la peticion con `JSON.stringify(valores)`, que ELIMINA toda
 * clave cuyo valor sea `undefined`: el PATCH que de verdad viaja a PostgREST
 * nunca incluye esa columna, y PostgREST dela COLUMNA TAL COMO ESTABA en vez
 * de ponerla a NULL. El vendedor borraba la direccion, guardaba, no recibia
 * ningun error -- y al recargar la direccion vieja seguia ahi.
 *
 * El arreglo NO toca la validacion (vacio sigue siendo "sin dato" ahi, tal
 * como lo dejo la Task 5): solo cambia como se ESCRIBE ese "sin dato" en el
 * UPDATE, sustituyendo cada clave ausente/undefined de los seis campos
 * opcionales por un `null` EXPLICITO, que SI viaja en el JSON y SI le dice a
 * PostgREST "pon esta columna a NULL".
 */
function paraElUpdate(datos: Omit<DatosPropiedad, 'direccion'>): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...datos }
  for (const campo of CAMPOS_OPCIONALES_ANULABLES) {
    if (payload[campo] === undefined) payload[campo] = null
  }
  return payload
}

export async function actualizarPropiedad(
  _estado: EstadoPropiedad,
  formData: FormData,
): Promise<EstadoPropiedad> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: MENSAJE_GENERICO }

  // Los seis campos opcionales se pasan tal cual llegan del FormData
  // ('', ' ' o null): esquemaPropiedad ya los normaliza a undefined con su
  // propio preprocesado (ver src/lib/validacion/esquemas.ts). Anadir aqui un
  // `|| undefined` seria redundante y, peor, convertiria un '0' legitimo
  // (0 habitaciones) en cadena vacia -> undefined por accidente de JS.
  const analisis = esquemaPropiedad.safeParse({
    titulo: formData.get('titulo'),
    descripcion: formData.get('descripcion') ?? '',
    operacion: formData.get('operacion'),
    tipo_inmueble: formData.get('tipo_inmueble'),
    precio: formData.get('precio'),
    habitaciones: formData.get('habitaciones'),
    banos: formData.get('banos'),
    area_m2: formData.get('area_m2'),
    barrio_id: formData.get('barrio_id'),
    direccion: formData.get('direccion'),
  })

  if (!analisis.success) {
    const errores: Record<string, string> = {}
    for (const problema of analisis.error.issues) {
      errores[String(problema.path[0])] = problema.message
    }
    return { errores }
  }

  const supabase = await crearClienteServidor()

  // direccion se separa del resto: desde 20260914000100 vive en
  // propiedades_ubicacion, no en propiedades (cierre de la fuga que dejaba
  // leer la direccion exacta a cualquier autenticado -- ver la migracion).
  const { direccion, ...datosPropiedad } = analisis.data

  // El slug NO se actualiza nunca, aunque cambie el titulo: un slug que muta
  // rompe los enlaces ya publicados. analisis.data sale de esquemaPropiedad,
  // que no tiene un campo `slug`, asi que no hay forma de que se cuele aqui.
  // paraElUpdate() convierte los opcionales vaciados (undefined) en `null`
  // explicito -- ver su comentario arriba -- sin anadir ninguna clave nueva
  // que esquemaPropiedad no tuviera ya.
  const { data, error } = await supabase
    .from('propiedades').update(paraElUpdate(datosPropiedad)).eq('id', id).select('id')

  if (error) { mapearError(error); return { error: MENSAJE_GENERICO } }

  // RLS deniega filtrando filas: cero filas significa "no es tuya".
  if (!data || data.length === 0) return { error: MENSAJE_GENERICO }

  // Upsert por propiedad_id: una propiedad puede no tener fila todavia en
  // propiedades_ubicacion (nace sin ella; la primera vez que el vendedor
  // guarda una direccion es un INSERT, no un UPDATE). `direccion ?? null`
  // conserva el mismo comportamiento documentado que corrigio paraElUpdate:
  // borrar la direccion y guardar tiene que dejarla en NULL de verdad, no
  // dejar la columna intacta -- ver el hallazgo de mas arriba sobre
  // JSON.stringify omitiendo las claves `undefined`.
  //
  // NO es la misma transaccion que el UPDATE de arriba: supabase-js no
  // ofrece una API de transaccion multi-tabla para un server action (eso
  // exigiria una funcion de base de datos, que este arreglo no crea -- ver
  // el reporte). Si este upsert falla DESPUES de que el UPDATE de
  // propiedades ya tuvo exito, el vendedor se queda con los demas campos
  // guardados pero la direccion sin actualizar -- nunca en NULL a medias ni
  // corrupta, porque ninguna columna se comparte entre las dos escrituras.
  // Se devuelve error para que el vendedor vea que algo fallo y reintente:
  // reintentar es seguro, las dos escrituras son idempotentes.
  const { error: errorUbicacion } = await supabase
    .from('propiedades_ubicacion')
    .upsert({ propiedad_id: id, direccion: direccion ?? null }, { onConflict: 'propiedad_id' })

  if (errorUbicacion) { mapearError(errorUbicacion); return { error: MENSAJE_GENERICO } }

  revalidatePath(`/panel/propiedades/${id}`)
  revalidatePath('/panel')
  return {}
}

export type EstadoDestino = 'publicada' | 'pausada' | 'vendida' | 'borrador'

/**
 * Lo que le falta a la propiedad para publicarse, de las DOS condiciones que
 * la base exige de verdad (propiedades_exigir_imagen y
 * propiedades_exigir_precio). Deliberadamente NO reutiliza
 * faltantesParaPublicar (src/lib/propiedades/completitud.ts): esa funcion
 * tambien reporta barrio y descripcion, que son solo guia del panel -- una
 * propiedad sin barrio SI puede publicarse -- y usarla aqui tal cual
 * bloquearia una publicacion que la base permite.
 *
 * Correccion del hallazgo Importante de la revision final de rama: este
 * comentario ya avisaba del error correcto, pero [id]/page.tsx lo cometia
 * de todos modos -- deshabilitaba el boton "Publicar" con
 * `faltantesParaPublicar(...).length > 0` completo, bloqueando por barrio o
 * descripcion algo que esta misma funcion (y la base) SI permiten publicar.
 * Ahora esa pantalla usa puedePublicar() (completitud.ts), que replica estas
 * mismas DOS condiciones -- foto y precio, nada mas -- para decidir si el
 * boton se puede pulsar. Las dos funciones quedan alineadas a proposito: si
 * un requisito nuevo se vuelve exigencia real de la base, debe anadirse en
 * los dos sitios (o factorizarse), nunca solo en uno.
 *
 * Se consulta con el cliente del propio vendedor (RLS de por medio a
 * proposito): si `id` no es suyo, `propiedad` sale null y esta funcion no
 * dice nada -- el UPDATE que sigue en cambiarEstado() se encarga de la
 * autorizacion y responde el mensaje generico de siempre.
 *
 * Orden de los checks: foto antes que precio, igual que en la base. Los
 * triggers BEFORE de un mismo evento se ejecutan en Postgres por orden
 * alfabetico de nombre ('imagen' antes que 'precio', ver el comentario de
 * precio-publicar.test.ts), asi que si a alguien le faltan las dos cosas la
 * base tambien le mostraria primero el 23514 de la imagen. Se documenta aqui
 * la decision para cuando faltan ambas: se avisa de la foto primero.
 */
async function faltaParaPublicar(
  supabase: SupabaseClient,
  id: string,
): Promise<string | null> {
  const { data: propiedad } = await supabase
    .from('propiedades')
    .select('precio, imagenes_propiedad(id)')
    .eq('id', id)
    .maybeSingle()

  if (!propiedad) return null

  const numeroDeImagenes = (propiedad.imagenes_propiedad as unknown[] | null)?.length ?? 0
  if (numeroDeImagenes < 1) return MENSAJE_SIN_FOTOS
  if (propiedad.precio === null) return MENSAJE_SIN_PRECIO
  return null
}

export async function cambiarEstado(id: string, estado: EstadoDestino): Promise<EstadoPropiedad> {
  const supabase = await crearClienteServidor()

  // Solo al PUBLICAR hace falta esta comprobacion previa: pausar, marcar
  // vendida o devolver a borrador no tienen requisito alguno en la base.
  if (estado === 'publicada') {
    const mensaje = await faltaParaPublicar(supabase, id)
    if (mensaje) return { error: mensaje }
  }

  const { data, error } = await supabase
    .from('propiedades').update({ estado }).eq('id', id).select('id')

  // mapearError(error).mensaje, no MENSAJE_GENERICO a secas: red de
  // seguridad para el 23514 de los triggers de imagen/precio, por si la
  // fila cambia en el hueco entre faltaParaPublicar() y este UPDATE (ver
  // MENSAJE_REQUISITOS_PUBLICACION en mapear.ts). El camino normal ya
  // devolvio antes con el mensaje exacto.
  if (error) return { error: mapearError(error).mensaje }

  // RLS deniega filtrando filas: cero filas significa "no es tuya".
  if (!data || data.length === 0) return { error: MENSAJE_GENERICO }

  revalidatePath('/panel')
  revalidatePath(`/panel/propiedades/${id}`)
  return {}
}

export async function eliminarPropiedad(id: string): Promise<EstadoPropiedad> {
  const supabase = await crearClienteServidor()

  // Borrar como el vendedor: RLS (propiedades_borrado_dueno) garantiza que
  // solo puede borrar lo suyo. El ON DELETE CASCADE de imagenes_propiedad se
  // encarga de sus imagenes, y el trigger imagenes_encolar_limpieza deja sus
  // rutas en limpieza_almacenamiento (ver 20260904000400).
  const { data, error } = await supabase
    .from('propiedades').delete().eq('id', id).select('id')

  if (error) { mapearError(error); return { error: MENSAJE_GENERICO } }

  // RLS deniega filtrando filas: cero filas significa "no es tuya".
  if (!data || data.length === 0) return { error: MENSAJE_GENERICO }

  await drenarLimpieza()
  revalidatePath('/panel')
  return {}
}

/**
 * El CASCADE ya borro las filas de imagenes_propiedad y el trigger dejo sus
 * rutas en limpieza_almacenamiento. Los bytes solo los borra la API de
 * Storage, y esa tabla solo la puede tocar service_role (sin GRANT a nadie
 * mas, ver 20260904000400).
 *
 * Drena hasta 100 filas pendientes en CADA borrado, no solo las de la
 * propiedad que se acaba de borrar: cualquier resto de una limpieza previa
 * que fallara (ver el comentario de mas abajo) se intenta de nuevo aqui, sin
 * necesitar un job aparte.
 *
 * Si el borrado en Storage falla para alguna ruta, esa fila NO se quita de
 * la cola: se queda pendiente para el proximo drenado. Basura acumulada en
 * la cola, nunca un archivo perdido sin registro de que falta borrarlo.
 */
async function drenarLimpieza(): Promise<void> {
  // crearClienteAdmin ya existe en src/lib/supabase/cliente-admin.ts, con
  // import 'server-only'. NO construir otro cliente aqui: salta RLS por
  // completo y solo debe usarse para esto, nunca para atender datos que
  // pidio el usuario.
  const admin = crearClienteAdmin()

  const { data: pendientes } = await admin
    .from('limpieza_almacenamiento').select('id, ruta').limit(100)

  if (!pendientes || pendientes.length === 0) return

  const { data: borrados } = await admin.storage
    .from(BUCKET_PROPIEDADES)
    .remove(pendientes.map((p) => p.ruta))

  const rutasBorradas = new Set((borrados ?? []).map((o) => o.name))
  const idsCumplidos = pendientes.filter((p) => rutasBorradas.has(p.ruta)).map((p) => p.id)

  if (idsCumplidos.length > 0) {
    await admin.from('limpieza_almacenamiento').delete().in('id', idsCumplidos)
  }
}
