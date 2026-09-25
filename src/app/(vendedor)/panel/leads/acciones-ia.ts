'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'

export interface ResultadoAccionIA {
  ok: boolean
  error?: string
}

export async function aprobarCitaPropuesta(
  conversacionId: string,
): Promise<ResultadoAccionIA> {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.auth.getUser()
  const usuario = data?.user
  if (!usuario) {
    return { ok: false, error: 'No autenticado' }
  }

  // Verifica que el usuario autenticado sea el vendedor de la conversacion
  const { data: conv, error: errConv } = await supabase
    .from('conversaciones_ia')
    .select('id, lead_id, comprador_id, vendedor_id, franja_propuesta, estado_conversacion')
    .eq('id', conversacionId)
    .eq('vendedor_id', usuario.id)
    .maybeSingle()

  if (errConv || !conv) {
    return { ok: false, error: 'Conversación no encontrada o no autorizada' }
  }

  if (conv.estado_conversacion !== 'cita_propuesta' || !conv.franja_propuesta) {
    return { ok: false, error: 'La conversación no tiene una cita propuesta pendiente' }
  }

  // Carga admin dinamicamente para aislar server-only en tests unitarios de componentes cliente
  const { crearClienteAdmin } = await import('@/lib/supabase/cliente-admin')
  const admin = crearClienteAdmin()
  const { data: citaId, error: errReserva } = await admin.rpc('reservar_cita_como', {
    p_lead_id: conv.lead_id,
    p_inicio: conv.franja_propuesta,
    p_actor: conv.comprador_id,
  })

  if (errReserva) {
    return { ok: false, error: errReserva.message || 'Error al reservar la visita' }
  }

  // Aviso por correo al comprador: es el vendedor quien la confirma.
  const { avisarCita } = await import('@/lib/notificaciones/citas')
  await avisarCita(citaId as string, 'reservada', usuario.id)

  // Marca estado_conversacion = 'cita_confirmada'
  await admin
    .from('conversaciones_ia')
    .update({ estado_conversacion: 'cita_confirmada' })
    .eq('id', conversacionId)

  // Registra auditoria
  await admin.rpc('registrar_auditoria', {
    p_usuario_id: usuario.id,
    p_accion: 'ia_cita_aprobada_vendedor',
    p_detalles: { conversacion_id: conversacionId, lead_id: conv.lead_id },
  })

  revalidatePath('/panel/citas')
  revalidatePath('/panel/leads')
  return { ok: true }
}

export async function actualizarAutoConfirmacion(
  valor: boolean,
): Promise<ResultadoAccionIA> {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.auth.getUser()
  const usuario = data?.user
  if (!usuario) {
    return { ok: false, error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('disponibilidad_semanal')
    .update({ auto_confirmar_citas: valor })
    .eq('vendedor_id', usuario.id)

  if (error) {
    return { ok: false, error: error.message || 'Error al actualizar auto-confirmación' }
  }

  revalidatePath('/panel/disponibilidad')
  return { ok: true }
}
