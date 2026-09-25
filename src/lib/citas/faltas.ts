/** Antelacion minima para cancelar o mover sin falta. Debe coincidir con 20260926000100. */
export const HORAS_SIN_FALTA = 8

/** true si cancelar o mover una visita que empieza en `inicio` anotaria una falta. */
export function esCambioTardio(inicio: string | Date, ahora: Date = new Date()): boolean {
  return new Date(inicio).getTime() - ahora.getTime() < HORAS_SIN_FALTA * 60 * 60 * 1000
}

interface ClienteConRpc {
  rpc?: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>
}

/**
 * Hasta cuando tiene bloqueadas las citas el usuario de la sesion, o null.
 * Un fallo de la consulta se trata como "sin bloqueo": es solo un aviso, la
 * regla la hace cumplir reservar_cita_como en la base.
 */
export async function miBloqueoDeCitas(cliente: ClienteConRpc): Promise<string | null> {
  if (typeof cliente?.rpc !== 'function') return null
  const { data, error } = await cliente.rpc('mi_bloqueo_citas')
  if (error || typeof data !== 'string') return null
  return data
}
