'use server'

import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { esquemaLead } from '@/lib/validacion/esquemas'
import {
  MENSAJE_GENERICO, MENSAJE_LEAD_DUPLICADO,
  MENSAJE_LEAD_NO_PUBLICADA, MENSAJE_LEAD_PROPIA,
} from '@/lib/errores/mapear'
import { procesarLeadIndividual } from '@/lib/ia/despachador'

export interface EstadoLead {
  error?: string
  enviado?: boolean
}

const CODIGO_NO_PUBLICADA = 'LD002'
const CODIGO_PROPIA = 'LD003'
const CODIGO_DUPLICADO = '23505'

export async function enviarLead(_previo: EstadoLead, formData: FormData): Promise<EstadoLead> {
  const analisis = esquemaLead.safeParse({
    mensaje: formData.get('mensaje'),
    telefono: formData.get('telefono'),
  })
  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? MENSAJE_GENERICO }
  }

  const propiedadId = formData.get('propiedad_id')
  if (typeof propiedadId !== 'string') return { error: MENSAJE_GENERICO }

  const { data, error } = await (await crearClienteServidor()).rpc('crear_lead', {
    p_propiedad_id: propiedadId,
    p_telefono: analisis.data.telefono,
    p_mensaje: analisis.data.mensaje,
  })

  if (!error) {
    const leadId = data as string | undefined
    if (leadId) {
      try {
        after(async () => {
          try {
            await procesarLeadIndividual(leadId)
          } catch (err) {
            console.error('Error al despachar atencion automatica de lead:', err)
          }
        })
      } catch {
        // En entornos de prueba fuera del contexto de solicitud de Next.js
      }
    }
    return { enviado: true }
  }

  if (error.code === CODIGO_DUPLICADO) return { error: MENSAJE_LEAD_DUPLICADO }
  if (error.code === CODIGO_NO_PUBLICADA) return { error: MENSAJE_LEAD_NO_PUBLICADA }
  if (error.code === CODIGO_PROPIA) return { error: MENSAJE_LEAD_PROPIA }
  return { error: MENSAJE_GENERICO }
}

export interface EstadoAgendar {
  error?: string
}

const MENSAJE_AGENDAR =
  'Hola, me interesa esta propiedad y quiero agendar una visita. ¿Qué horarios tienen disponibles?'

/**
 * Boton "Agendar visita" de la ficha: lleva al comprador al chat del
 * asistente que agenda la cita. Si todavia no habia contactado, crea el lead
 * con un mensaje fijo (mismo RPC crear_lead que el formulario, con sus mismas
 * reglas) y abre la conversacion con el asistente ANTES de redirigir, para que
 * el chat no llegue vacio. Si ya habia contactado, solo lo lleva a su chat.
 */
export async function iniciarChatAgendamiento(
  _previo: EstadoAgendar, formData: FormData,
): Promise<EstadoAgendar> {
  const propiedadId = formData.get('propiedad_id')
  const rutaFicha = formData.get('ruta_ficha')
  if (typeof propiedadId !== 'string' || typeof rutaFicha !== 'string') return { error: MENSAJE_GENERICO }

  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?volver=${encodeURIComponent(rutaFicha)}`)

  const { data: previo } = await supabase.from('leads').select('id')
    .eq('propiedad_id', propiedadId).eq('comprador_id', user.id).maybeSingle()

  let leadId = previo?.id as string | undefined
  if (!leadId) {
    const { data: perfil } = await supabase.from('perfiles').select('telefono')
      .eq('id', user.id).maybeSingle()
    const { data, error } = await supabase.rpc('crear_lead', {
      p_propiedad_id: propiedadId,
      p_telefono: perfil?.telefono ?? '',
      p_mensaje: MENSAJE_AGENDAR,
    })
    if (error) {
      if (error.code === CODIGO_NO_PUBLICADA) return { error: MENSAJE_LEAD_NO_PUBLICADA }
      if (error.code === CODIGO_PROPIA) return { error: MENSAJE_LEAD_PROPIA }
      return { error: MENSAJE_GENERICO }
    }
    leadId = data as string
  }

  // Idempotente: si la conversacion ya existe no hace nada.
  try {
    await procesarLeadIndividual(leadId)
  } catch (err) {
    console.error('No se pudo abrir la conversacion con el asistente:', err)
  }

  redirect(`/mi-cuenta/chat/${leadId}`)
}
