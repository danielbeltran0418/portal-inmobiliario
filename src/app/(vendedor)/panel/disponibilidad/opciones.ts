/** ISO: el indice 0 es el lunes (dia_semana = 1). */
export const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const

/** 00:00 a 23:00: una franja empieza como muy tarde a las 23:00. */
export const HORAS_INICIO: readonly string[] = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)

/** 01:00 a 24:00: la ultima franja del dia termina a las 24:00. */
export const HORAS_FIN: readonly string[] = Array.from({ length: 24 }, (_, h) => `${String(h + 1).padStart(2, '0')}:00`)

export function nombreDia(dia: number): string {
  return DIAS_SEMANA[dia - 1] ?? ''
}

/** '15:00:00' (time de Postgres) -> '15:00'. */
export function horaCorta(hora: string): string {
  return hora.slice(0, 5)
}
