'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { MENSAJE_GENERICO, mensajeDeErrorCita } from '@/lib/errores/mapear'
import { esquemaCancelarCita, esquemaMoverCita, esquemaReserva } from '@/lib/validacion/esquemas'

export interface ResultadoAccionCita {
  error?: string
  hecho?: boolean
}

function revalidarVistasDeCitas() {
  revalidatePath('/mi-cuenta')
  revalidatePath('/panel/citas')
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

  const { error } = await (await crearClienteServidor()).rpc('reservar_cita', {
    p_lead_id: analisis.data.lead_id,
    p_inicio: analisis.data.inicio,
  })
  if (error) return { error: mensajeDeErrorCita(error) }

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

  const { error } = await (await crearClienteServidor()).rpc('mover_cita', {
    p_cita_id: analisis.data.cita_id,
    p_nuevo_inicio: analisis.data.inicio,
  })
  if (error) return { error: mensajeDeErrorCita(error) }

  revalidarVistasDeCitas()
  return { hecho: true }
}

export async function cancelarCita(
  _previo: ResultadoAccionCita, formData: FormData,
): Promise<ResultadoAccionCita> {
  const analisis = esquemaCancelarCita.safeParse({ cita_id: formData.get('cita_id') })
  if (!analisis.success) return { error: MENSAJE_GENERICO }

  const { error } = await (await crearClienteServidor()).rpc('cancelar_cita', {
    p_cita_id: analisis.data.cita_id,
  })
  if (error) return { error: mensajeDeErrorCita(error) }

  revalidarVistasDeCitas()
  return { hecho: true }
}
