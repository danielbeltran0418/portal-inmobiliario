import 'server-only';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';
import { ErrorIA } from './tipos';

export interface ResultadoCalificacion {
  ok: boolean;
  decision: 'aceptado' | 'descartado';
  razon: string;
}

export async function calificarLeadConversacion(
  conversacionId: string,
  decision: 'aceptado' | 'descartado',
  razon: string
): Promise<ResultadoCalificacion> {
  const admin = crearClienteAdmin();

  // 1. Buscar la conversación
  const { data: conv, error: errConv } = await admin
    .from('conversaciones_ia')
    .select('id, lead_id, comprador_id, vendedor_id, estado_conversacion')
    .eq('id', conversacionId)
    .single();

  if (errConv || !conv) {
    throw new ErrorIA('IA001', `Conversación no encontrada: ${conversacionId}`);
  }

  if (conv.estado_conversacion === 'cerrada') {
    throw new ErrorIA('IA001', 'La conversación ya se encuentra cerrada');
  }

  // 2. Transicionar el lead en Postgres (valida con trigger validar_transicion_lead)
  const { error: errLead } = await admin
    .from('leads')
    .update({ estado: decision })
    .eq('id', conv.lead_id);

  if (errLead) {
    // Si ya habia transicionado antes (LD004), no abortamos la actualizacion de la conversacion
    if (errLead.code !== 'LD004') {
      console.warn('[IA] Error transicionando lead:', errLead);
    }
  }

  // 3. Actualizar estado_conversacion y resumen_calificacion
  const nuevoEstado = decision === 'descartado' ? 'cerrada' : 'calificada';
  await admin
    .from('conversaciones_ia')
    .update({
      estado_conversacion: nuevoEstado,
      resumen_calificacion: razon,
    })
    .eq('id', conv.id);

  // 4. Auditoría
  await admin.rpc('registrar_evento_auditoria', {
    p_accion: 'ia_lead_calificado',
    p_entidad: 'conversaciones_ia',
    p_entidad_id: conv.id,
    p_actor_id: conv.comprador_id,
    p_metadatos: {
      lead_id: conv.lead_id,
      decision,
      razon,
    },
    p_ip: null,
  });

  return {
    ok: true,
    decision,
    razon,
  };
}
