'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { MENSAJE_GENERICO, mensajeDeErrorCita } from '@/lib/errores/mapear'
import { esquemaCancelarCita, esquemaMoverCita, esquemaReserva } from '@/lib/validacion/esquemas'
import type { EventoCita } from '@/lib/notificaciones/citas'

export interface ResultadoAccionCita {
  error?: string
  hecho?: boolean
}

function revalidarVistasDeCitas() {
  revalidatePath('/mi-cuenta')
  revalidatePath('/panel/citas')
}

type ClienteServidor = Awaited<ReturnType<typeof crearClienteServidor>>

/**
 * El correo a la otra parte sale despues de responder (after): la visita ya
 * quedo hecha en la base y el usuario no tiene por que esperar a Resend.
 * Fuera de una peticion de Next (pruebas) after() lanza, y se envia sin mas.
 *
 * Import dinamico: este modulo lo importan componentes cliente
 * (acciones-cita.tsx), y el de correo declara server-only.
 */
async function avisarDespues(supabase: ClienteServidor, citaId: string, evento: EventoCita) {
  const { data } = await supabase.auth.getUser()
  const actor = data.user?.id
  if (!actor) return
  const { avisarCita } = await import('@/lib/notificaciones/citas')
  try {
    after(() => avisarCita(citaId, evento, actor))
  } catch {
    void avisarCita(citaId, evento, actor)
  }
}

/**
 * Las tres acciones siguen el mismo orden: validar, llamar al RPC CON LOS
 * VALORES VALIDADOS (analisis.data, nunca formData otra vez), traducir el
 * error por codigo. Los RPC devuelven error ante cualquier regla rota, asi que
 * no hay un "0 filas sin error" que vigilar aqui: eso aplica a los UPDATE y
 * DELETE directos de disponibilidad (src/app/(vendedor)/panel/disponibilidad).
 */
export async function reservarCita(
  _previo: ResultadoAccionCita, formData: FormData,
): Promise<ResultadoAccionCita> {
  const analisis = esquemaReserva.safeParse({
    lead_id: formData.get('lead_id'),
    inicio: formData.get('inicio'),
  })
  if (!analisis.success) return { error: MENSAJE_GENERICO }

  const supabase = await crearClienteServidor()
  const { data: citaId, error } = await supabase.rpc('reservar_cita', {
    p_lead_id: analisis.data.lead_id,
    p_inicio: analisis.data.inicio,
  })
  if (error) return { error: mensajeDeErrorCita(error) }

  await avisarDespues(supabase, citaId as string, 'reservada')
  revalidarVistasDeCitas()
  return { hecho: true }
}

export async function moverCita(
  _previo: ResultadoAccionCita, formData: FormData,
): Promise<ResultadoAccionCita> {
  const analisis = esquemaMoverCita.safeParse({
    cita_id: formData.get('cita_id'),
    inicio: formData.get('inicio'),
  })
  if (!analisis.success) return { error: MENSAJE_GENERICO }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('mover_cita', {
    p_cita_id: analisis.data.cita_id,
    p_nuevo_inicio: analisis.data.inicio,
  })
  if (error) return { error: mensajeDeErrorCita(error) }

  await avisarDespues(supabase, analisis.data.cita_id, 'movida')
  revalidarVistasDeCitas()
  return { hecho: true }
}

export async function cancelarCita(
  _previo: ResultadoAccionCita, formData: FormData,
): Promise<ResultadoAccionCita> {
  const analisis = esquemaCancelarCita.safeParse({ cita_id: formData.get('cita_id') })
  if (!analisis.success) return { error: MENSAJE_GENERICO }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('cancelar_cita', {
    p_cita_id: analisis.data.cita_id,
  })
  if (error) return { error: mensajeDeErrorCita(error) }

  await avisarDespues(supabase, analisis.data.cita_id, 'cancelada')
  revalidarVistasDeCitas()
  return { hecho: true }
}
