'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { esquemaPropiedad, esquemaPropiedadNueva } from '@/lib/validacion/esquemas'
import { mapearError, MENSAJE_GENERICO } from '@/lib/errores/mapear'
import { generarSlug } from '@/lib/propiedades/slug'

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
        precio: 1,
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

export async function actualizarPropiedad(
  _estado: EstadoPropiedad,
  formData: FormData,
): Promise<EstadoPropiedad> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: MENSAJE_GENERICO }

  // Los cinco campos opcionales se pasan tal cual llegan del FormData
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

  // El slug NO se actualiza nunca, aunque cambie el titulo: un slug que muta
  // rompe los enlaces ya publicados. analisis.data sale de esquemaPropiedad,
  // que no tiene un campo `slug`, asi que no hay forma de que se cuele aqui.
  const { data, error } = await supabase
    .from('propiedades').update(analisis.data).eq('id', id).select('id')

  if (error) { mapearError(error); return { error: MENSAJE_GENERICO } }

  // RLS deniega filtrando filas: cero filas significa "no es tuya".
  if (!data || data.length === 0) return { error: MENSAJE_GENERICO }

  revalidatePath(`/panel/propiedades/${id}`)
  revalidatePath('/panel')
  return {}
}
