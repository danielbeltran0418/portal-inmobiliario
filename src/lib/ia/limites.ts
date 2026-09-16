
export async function verificarRateLimitPorIP(_ip?: string | null): Promise<void> {
  // Verificación extensible de rate limit por IP
}
import 'server-only';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';
import { ErrorIA } from './tipos';

export const MAX_TURNOS_CONVERSACION = 10;
export const MAX_MENSAJES_POR_MINUTO = 5;
export const MAX_LEADS_ACTIVOS_24H = 3;
export const HARD_CAP_TOKENS = 15000;

export const MENSAJE_DESPEDIDA_TOPE_TURNOS =
  'He transferido tu historial y tus datos directamente al vendedor para que te brinde atención personalizada. ¡Muchas gracias por tu interés!';

export class ErrorLimiteAbuso extends Error {
  readonly codigo: 'IA_TOPE_TURNOS' | 'IA_TOPE_TOKENS' | 'IA_RATE_LIMIT' | 'IA_CONCURRENCIA';
  readonly status: number;
  readonly retryAfter?: number;

  constructor(
    codigo: 'IA_TOPE_TURNOS' | 'IA_TOPE_TOKENS' | 'IA_RATE_LIMIT' | 'IA_CONCURRENCIA',
    mensaje: string,
    status = 400,
    retryAfter?: number
  ) {
    super(`[${codigo}] ${mensaje}`);
    this.name = 'ErrorLimiteAbuso';
    this.codigo = codigo;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export interface MetricasConversacion {
  turnosComprador: number;
  tokensTotales: number;
  estadoConversacion: string;
}

export async function consultarMetricasConversacion(
  conversacionId: string
): Promise<MetricasConversacion> {
  const admin = crearClienteAdmin();

  const { data: conv, error: errConv } = await admin
    .from('conversaciones_ia')
    .select('estado_conversacion')
    .eq('id', conversacionId)
    .single();

  if (errConv || !conv) {
    throw new ErrorIA('IA001', `Conversación no encontrada: ${conversacionId}`);
  }

  const { data: mensajes, error: errMsgs } = await admin
    .from('mensajes_ia')
    .select('emisor, tokens_entrada, tokens_salida')
    .eq('conversacion_id', conversacionId);

  if (errMsgs) {
    throw new Error(`Error al consultar mensajes_ia: ${errMsgs.message}`);
  }

  const turnosComprador = (mensajes ?? []).filter((m) => m.emisor === 'comprador').length;
  const tokensTotales = (mensajes ?? []).reduce(
    (acc, m) => acc + (m.tokens_entrada ?? 0) + (m.tokens_salida ?? 0),
    0
  );

  return {
    turnosComprador,
    tokensTotales,
    estadoConversacion: conv.estado_conversacion,
  };
}

export async function verificarLimitesConversacion(
  conversacionId: string,
  compradorId: string,
  ip?: string | null
): Promise<void> {
  if (ip) {
    await verificarRateLimitPorIP(ip);
  }
  const admin = crearClienteAdmin();
  const metricas = await consultarMetricasConversacion(conversacionId);

  if (metricas.estadoConversacion === 'cerrada') {
    throw new ErrorLimiteAbuso(
      'IA_TOPE_TURNOS',
      'La conversación ya se encuentra cerrada y no admite más mensajes.',
      400
    );
  }

  // 1. Tope de turnos (10)
  if (metricas.turnosComprador >= MAX_TURNOS_CONVERSACION) {
    await admin
      .from('conversaciones_ia')
      .update({ estado_conversacion: 'cerrada' })
      .eq('id', conversacionId);

    const { data: conv } = await admin
      .from('conversaciones_ia')
      .select('comprador_id, vendedor_id')
      .eq('id', conversacionId)
      .single();

    if (conv) {
      await admin.from('mensajes_ia').insert({
        conversacion_id: conversacionId,
        comprador_id: conv.comprador_id,
        vendedor_id: conv.vendedor_id,
        emisor: 'agente_ia',
        contenido: MENSAJE_DESPEDIDA_TOPE_TURNOS,
        tokens_entrada: 0,
        tokens_salida: 0,
        modelo: 'sistema',
      });
    }

    throw new ErrorLimiteAbuso('IA_TOPE_TURNOS', MENSAJE_DESPEDIDA_TOPE_TURNOS, 400);
  }

  // 2. Tope de tokens (15,000)
  if (metricas.tokensTotales >= HARD_CAP_TOKENS) {
    await admin
      .from('conversaciones_ia')
      .update({ estado_conversacion: 'cerrada' })
      .eq('id', conversacionId);

    throw new ErrorLimiteAbuso(
      'IA_TOPE_TOKENS',
      'Presupuesto máximo de tokens superado para esta conversación.',
      400
    );
  }

  // 3. Frecuencia por conversación/comprador en el último minuto (máximo 5)
  const haceUnMinuto = new Date(Date.now() - 60 * 1000).toISOString();
  const { count, error: errCount } = await admin
    .from('mensajes_ia')
    .select('*', { count: 'exact', head: true })
    .eq('conversacion_id', conversacionId)
    .eq('emisor', 'comprador')
    .gte('creado_en', haceUnMinuto);

  if (!errCount && count !== null && count >= MAX_MENSAJES_POR_MINUTO) {
    throw new ErrorLimiteAbuso(
      'IA_RATE_LIMIT',
      'Demasiados mensajes en un minuto. Por favor espere antes de continuar.',
      429,
      60
    );
  }

  // 4. Concurrencia de leads activos en 24h (máximo 3)
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: leadsActivos, error: errLeads } = await admin
    .from('conversaciones_ia')
    .select('*', { count: 'exact', head: true })
    .eq('comprador_id', compradorId)
    .in('estado_conversacion', ['activa', 'calificada', 'cita_propuesta'])
    .gte('creado_en', hace24h);

  if (!errLeads && leadsActivos !== null && leadsActivos >= MAX_LEADS_ACTIVOS_24H) {
    throw new ErrorLimiteAbuso(
      'IA_CONCURRENCIA',
      'Límite de conversaciones activas simultáneas alcanzado en 24 horas (máximo 3).',
      429,
      86400
    );
  }
}
