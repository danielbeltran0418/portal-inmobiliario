'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import {
  MENSAJE_BLOQUEO_NO_ENCONTRADO, MENSAJE_GENERICO, MENSAJE_HORARIO_NO_ENCONTRADO,
} from '@/lib/errores/mapear'
import { esquemaBloqueo, esquemaFranjaSemanal, esquemaIdentificador } from '@/lib/validacion/esquemas'

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
