'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import {
  MENSAJE_BLOQUEO_NO_ENCONTRADO, MENSAJE_GENERICO, MENSAJE_HORARIO_NO_ENCONTRADO,
} from '@/lib/errores/mapear'
import { esquemaBloqueo, esquemaFranjaSemanal, esquemaIdentificador } from '@/lib/validacion/esquemas'
import { horasCubiertas, rangosDesdeHoras, type FranjaSemanal } from '@/lib/citas/cuadricula'

export interface ResultadoDisponibilidad {
  error?: string
  hecho?: boolean
}

const RUTA = '/panel/disponibilidad'

async function clienteConUsuario() {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.auth.getUser()
  return { supabase, usuarioId: data.user?.id ?? null }
}

export async function agregarFranjaSemanal(
  _previo: ResultadoDisponibilidad, formData: FormData,
): Promise<ResultadoDisponibilidad> {
  const analisis = esquemaFranjaSemanal.safeParse({
    dia_semana: formData.get('dia_semana'),
    hora_inicio: formData.get('hora_inicio'),
    hora_fin: formData.get('hora_fin'),
  })
  if (!analisis.success) return { error: analisis.error.issues[0]?.message ?? MENSAJE_GENERICO }

  const { supabase, usuarioId } = await clienteConUsuario()
  if (!usuarioId) return { error: MENSAJE_GENERICO }

  const { data, error } = await supabase
    .from('disponibilidad_semanal')
    .insert({
      vendedor_id: usuarioId,
      dia_semana: analisis.data.dia_semana,
      hora_inicio: analisis.data.hora_inicio,
      hora_fin: analisis.data.hora_fin,
    })
    .select('id')
  if (error || !data || data.length === 0) return { error: MENSAJE_GENERICO }

  revalidatePath(RUTA)
  return { hecho: true }
}

export async function eliminarFranjaSemanal(
  _previo: ResultadoDisponibilidad, formData: FormData,
): Promise<ResultadoDisponibilidad> {
  const analisis = esquemaIdentificador.safeParse({ id: formData.get('id') })
  if (!analisis.success) return { error: MENSAJE_GENERICO }

  const { supabase, usuarioId } = await clienteConUsuario()
  if (!usuarioId) return { error: MENSAJE_GENERICO }

  // El .eq('vendedor_id') es explicito aunque la politica ya lo exija: una
  // politica de lectura FOR ALL anadida mas adelante no debe convertir este
  // DELETE en un borrado de filas ajenas.
  const { data, error } = await supabase
    .from('disponibilidad_semanal')
    .delete()
    .eq('id', analisis.data.id)
    .eq('vendedor_id', usuarioId)
    .select('id')
  if (error) return { error: MENSAJE_GENERICO }
  // .select() encadenado: un DELETE que no alcanza ninguna fila (ajena o ya
  // borrada) devuelve error null. Sin contar filas, pasaria por exito.
  if (!data || data.length === 0) return { error: MENSAJE_HORARIO_NO_ENCONTRADO }

  revalidatePath(RUTA)
  return { hecho: true }
}

const CELDA = /^([1-7])-([01]?\d|2[0-3])$/

/**
 * Clic en una celda de la cuadricula semanal: activa o quita esa hora y
 * reescribe el dia como rangos contiguos.
 *
 * Orden deliberado: primero se INSERTAN los rangos nuevos y solo despues se
 * borran las filas viejas. Si la insercion falla, el horario queda intacto; si
 * falla el borrado, quedan filas solapadas, que son inocuas (franjas_libres usa
 * DISTINCT) y el siguiente clic vuelve a fundir.
 */
export async function conmutarHoraSemanal(
  _previo: ResultadoDisponibilidad, formData: FormData,
): Promise<ResultadoDisponibilidad> {
  const coincidencia = CELDA.exec(String(formData.get('celda') ?? ''))
  if (!coincidencia) return { error: MENSAJE_GENERICO }
  const dia = Number(coincidencia[1])
  const hora = Number(coincidencia[2])

  const { supabase, usuarioId } = await clienteConUsuario()
  if (!usuarioId) return { error: MENSAJE_GENERICO }

  const { data: actuales, error: errorLectura } = await supabase
    .from('disponibilidad_semanal')
    .select('id,dia_semana,hora_inicio,hora_fin')
    .eq('vendedor_id', usuarioId)
    .eq('dia_semana', dia)
  if (errorLectura || !actuales) return { error: MENSAJE_GENERICO }

  const filas = actuales as FranjaSemanal[]
  const horas = horasCubiertas(filas, dia)
  if (horas.has(hora)) horas.delete(hora)
  else horas.add(hora)

  const nuevas = rangosDesdeHoras(horas).map((r) => ({ vendedor_id: usuarioId, dia_semana: dia, ...r }))
  if (nuevas.length > 0) {
    const { data, error } = await supabase.from('disponibilidad_semanal').insert(nuevas).select('id')
    if (error || !data || data.length !== nuevas.length) return { error: MENSAJE_GENERICO }
  }

  if (filas.length > 0) {
    const { error } = await supabase
      .from('disponibilidad_semanal')
      .delete()
      .in('id', filas.map((f) => f.id))
      .eq('vendedor_id', usuarioId)
      .select('id')
    if (error) {
      revalidatePath(RUTA)
      return { error: MENSAJE_GENERICO }
    }
  }

  revalidatePath(RUTA)
  return { hecho: true }
}

export async function bloquearFechas(
  _previo: ResultadoDisponibilidad, formData: FormData,
): Promise<ResultadoDisponibilidad> {
  const analisis = esquemaBloqueo.safeParse({
    desde: formData.get('desde'),
    hasta: formData.get('hasta'),
  })
  if (!analisis.success) return { error: analisis.error.issues[0]?.message ?? MENSAJE_GENERICO }

  const { supabase, usuarioId } = await clienteConUsuario()
  if (!usuarioId) return { error: MENSAJE_GENERICO }

  const { data, error } = await supabase
    .from('fechas_bloqueadas')
    .insert({ vendedor_id: usuarioId, desde: analisis.data.desde, hasta: analisis.data.hasta })
    .select('id')
  if (error || !data || data.length === 0) return { error: MENSAJE_GENERICO }

  revalidatePath(RUTA)
  return { hecho: true }
}

export async function desbloquearFechas(
  _previo: ResultadoDisponibilidad, formData: FormData,
): Promise<ResultadoDisponibilidad> {
  const analisis = esquemaIdentificador.safeParse({ id: formData.get('id') })
  if (!analisis.success) return { error: MENSAJE_GENERICO }

  const { supabase, usuarioId } = await clienteConUsuario()
  if (!usuarioId) return { error: MENSAJE_GENERICO }

  const { data, error } = await supabase
    .from('fechas_bloqueadas')
    .delete()
    .eq('id', analisis.data.id)
    .eq('vendedor_id', usuarioId)
    .select('id')
  if (error) return { error: MENSAJE_GENERICO }
  if (!data || data.length === 0) return { error: MENSAJE_BLOQUEO_NO_ENCONTRADO }

  revalidatePath(RUTA)
  return { hecho: true }
}
