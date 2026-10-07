
import 'server-only';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';
import { ErrorIA } from './tipos';

/**
 * Los topes (10 turnos, 15000 tokens, 5 mensajes por minuto, 3 conversaciones
 * activas en 24 h) viven en la base: registrar_mensaje_comprador_ia y
 * conversacion_excede_concurrencia (migraciones 20261009000100 y
 * 20261010000100). Aqui solo se traduce su resultado.
 */

export const MENSAJE_DESPEDIDA_TOPE_TURNOS =
  'He transferido tu historial y tus datos directamente al vendedor para que te brinde atención personalizada. ¡Muchas gracias por tu interés!';

export const MENSAJE_CONCURRENCIA =
  'Ya tienes 3 conversaciones activas con el asistente en las últimas 24 horas. Tu mensaje le llegó al vendedor, que te responderá directamente.';

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

/**
 * CN-013: comprueba los limites e inserta el mensaje del comprador en UNA
 * transaccion (registrar_mensaje_comprador_ia, migracion 20261009000100), con
 * la fila de la conversacion bloqueada. Comprobar y luego insertar por separado
 * dejaba que una rafaga de envios simultaneos pasara entera.
 */
export async function registrarMensajeComprador(
  conversacionId: string,
  compradorId: string,
  contenido: string
): Promise<void> {
  const { data, error } = await crearClienteAdmin().rpc('registrar_mensaje_comprador_ia', {
    p_conversacion_id: conversacionId,
    p_comprador_id: compradorId,
    p_contenido: contenido,
  });
  if (error) {
    throw new Error(`Error al registrar el mensaje: ${error.message}`);
  }

  switch (data as string) {
    case 'ok':
      return;
    case 'no_encontrada':
      throw new ErrorIA('IA001', `Conversación no encontrada: ${conversacionId}`);
    case 'cerrada':
      throw new ErrorLimiteAbuso(
        'IA_TOPE_TURNOS',
        'La conversación ya se encuentra cerrada y no admite más mensajes.',
        400
      );
    case 'tope_turnos':
      throw new ErrorLimiteAbuso('IA_TOPE_TURNOS', MENSAJE_DESPEDIDA_TOPE_TURNOS, 400);
    case 'tope_tokens':
      throw new ErrorLimiteAbuso(
        'IA_TOPE_TOKENS',
        'Presupuesto máximo de tokens superado para esta conversación.',
        400
      );
    case 'rate_limit':
      throw new ErrorLimiteAbuso(
        'IA_RATE_LIMIT',
        'Demasiados mensajes en un minuto. Por favor espere antes de continuar.',
        429,
        60
      );
    case 'concurrencia':
      throw new ErrorLimiteAbuso('IA_CONCURRENCIA', MENSAJE_CONCURRENCIA, 429, 86400);
    default:
      throw new Error(`Resultado inesperado de registrar_mensaje_comprador_ia: ${String(data)}`);
  }
}
