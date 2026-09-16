import 'server-only';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';
import { ErrorIA } from './tipos';

export interface FranjaLibre {
  inicio: string;
  fin: string;
}

export type ResultadoAgendamiento =
  | { tipo: 'confirmada'; citaId: string; inicioIso: string }
  | { tipo: 'propuesta'; inicioIso: string };

export async function obtenerFranjasLibresVendedor(
  vendedorId: string,
  dias = 14
): Promise<FranjaLibre[]> {
  const admin = crearClienteAdmin();
  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000);

  const { data, error } = await admin.rpc('franjas_libres', {
    p_vendedor_id: vendedorId,
    p_desde: ahora.toISOString(),
    p_hasta: hasta.toISOString(),
  });

  if (error) {
    console.warn('[IA] Error obteniendo franjas_libres:', error);
    return [];
  }

  return (data ?? []) as FranjaLibre[];
}

export async function procesarSolicitudFranja(
  conversacionId: string,
  inicioIso: string
): Promise<ResultadoAgendamiento> {
  const admin = crearClienteAdmin();

  // 1. Obtener la conversación y el estado del lead
  const { data: conv, error: errConv } = await admin
    .from('conversaciones_ia')
    .select(`
      id,
      lead_id,
      comprador_id,
      vendedor_id,
      estado_conversacion,
      leads (
        id,
        estado
      )
    `)
    .eq('id', conversacionId)
    .single();

  if (errConv || !conv) {
    throw new ErrorIA('IA001', `Conversación no encontrada: ${conversacionId}`);
  }

  const estadoLead = ((conv.leads as unknown) as { estado: string })?.estado;
  if (estadoLead === 'descartado') {
    throw new ErrorIA('IA005', 'Intento de reserva sobre un lead descartado');
  }

  // 2. Validar deterministamente que la franja esté libre y vigente
  const franjas = await obtenerFranjasLibresVendedor(conv.vendedor_id, 14);
  const inicioTarget = new Date(inicioIso).getTime();
  const franjaValida = franjas.some((f) => new Date(f.inicio).getTime() === inicioTarget);

  if (!franjaValida) {
    throw new ErrorIA('IA002', 'Franja solicitada no disponible o caducada');
  }

  // 3. Si el lead aún estaba en 'nuevo', calificarlo/transicionarlo a 'aceptado'
  if (estadoLead === 'nuevo') {
    await admin.from('leads').update({ estado: 'aceptado' }).eq('id', conv.lead_id);
  }

  // 4. Consultar configuración de auto-confirmación del vendedor
  const { data: disps } = await admin
    .from('disponibilidad_semanal')
    .select('auto_confirmar_citas')
    .eq('vendedor_id', conv.vendedor_id)
    .limit(1);

  const autoConfirmar =
    disps && disps.length > 0 ? Boolean(disps[0].auto_confirmar_citas) : false;

  // 5. Bifurcación según autonomía
  if (autoConfirmar) {
    // Caso A: Reserva inmediata autónoma
    const { data: citaId, error: errReserva } = await admin.rpc('reservar_cita_como', {
      p_lead_id: conv.lead_id,
      p_inicio: inicioIso,
      p_actor: conv.comprador_id,
    });

    if (errReserva) {
      throw new ErrorIA('IA002', `Error al reservar cita en base de datos: ${errReserva.message}`);
    }

    await admin
      .from('conversaciones_ia')
      .update({
        estado_conversacion: 'cita_confirmada',
        franja_propuesta: inicioIso,
      })
      .eq('id', conv.id);

    await admin.rpc('registrar_evento_auditoria', {
      p_accion: 'ia_cita_reservada',
      p_entidad: 'conversaciones_ia',
      p_entidad_id: conv.id,
      p_actor_id: conv.comprador_id,
      p_metadatos: {
        cita_id: citaId,
        inicio_iso: inicioIso,
      },
      p_ip: null,
    });

    return {
      tipo: 'confirmada',
      citaId: citaId as string,
      inicioIso,
    };
  } else {
    // Caso B: Cita propuesta esperando confirmación manual del vendedor en 1 clic
    await admin
      .from('conversaciones_ia')
      .update({
        estado_conversacion: 'cita_propuesta',
        franja_propuesta: inicioIso,
      })
      .eq('id', conv.id);

    await admin.rpc('registrar_evento_auditoria', {
      p_accion: 'ia_cita_propuesta',
      p_entidad: 'conversaciones_ia',
      p_entidad_id: conv.id,
      p_actor_id: conv.comprador_id,
      p_metadatos: {
        inicio_iso: inicioIso,
      },
      p_ip: null,
    });

    return {
      tipo: 'propuesta',
      inicioIso,
    };
  }
}
