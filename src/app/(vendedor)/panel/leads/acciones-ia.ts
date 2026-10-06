'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { MENSAJE_GENERICO, mensajeDeErrorCita } from '@/lib/errores/mapear'

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

  // Aprobar la propuesta ES aceptar el lead: el vendedor ya verificado arriba
  // toma la decision que el chat IA no puede tomar por el (procesarSolicitudFranja).
  // Con SU cliente y no con admin: el trigger de transicion registra
  // lead_aceptado con auth.uid(), y con service_role el actor quedaria NULL,
  // indistinguible de una aceptacion automatica. RLS y el GRANT de estado
  // le permiten actualizar sus propios leads.
  const { error: errAceptar } = await supabase
    .from('leads')
    .update({ estado: 'aceptado' })
    .eq('id', conv.lead_id)
    .eq('estado', 'nuevo')
  if (errAceptar) {
    console.error('[IA] Error al aceptar el lead al aprobar la cita:', errAceptar)
    return { ok: false, error: MENSAJE_GENERICO }
  }

  const { data: citaId, error: errReserva } = await admin.rpc('reservar_cita_como', {
    p_lead_id: conv.lead_id,
    p_inicio: conv.franja_propuesta,
    p_actor: conv.comprador_id,
  })

  if (errReserva) {
    // Por codigo, como en src/components/citas/acciones.ts: el message de
    // Postgres es un detalle interno y no se le muestra al vendedor.
    return { ok: false, error: mensajeDeErrorCita(errReserva) }
  }

  // Aviso por correo al comprador: es el vendedor quien la confirma.
  const { avisarCita } = await import('@/lib/notificaciones/citas')
  await avisarCita(citaId as string, 'reservada', usuario.id)

  // Marca estado_conversacion = 'cita_confirmada'
  await admin
    .from('conversaciones_ia')
    .update({ estado_conversacion: 'cita_confirmada' })
    .eq('id', conversacionId)

  // Registra auditoria. registrar_evento_auditoria es el unico escritor de
  // registro_auditoria (20260831000700); la llamada anterior apuntaba a una
  // funcion que no existe y el evento se perdia en silencio.
  await admin.rpc('registrar_evento_auditoria', {
    p_accion: 'ia_cita_aprobada_vendedor',
    p_entidad: 'conversaciones_ia',
    p_entidad_id: conversacionId,
    p_actor_id: usuario.id,
    p_metadatos: { lead_id: conv.lead_id, cita_id: citaId },
    p_ip: null,
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
    console.error('[IA] Error al actualizar auto-confirmacion:', error)
    return { ok: false, error: MENSAJE_GENERICO }
  }

  revalidatePath('/panel/disponibilidad')
  return { ok: true }
}
