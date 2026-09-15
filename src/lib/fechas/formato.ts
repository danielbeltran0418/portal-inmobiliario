/**
 * El UNICO sitio donde el codigo JavaScript toca fechas, y solo para
 * mostrarlas. Toda conversion de hora de pared a instante ocurre en Postgres
 * (supabase/migrations/20260915000300_franjas.sql).
 *
 * `timeZone` es OBLIGATORIO: Vercel corre en UTC y sin el las horas saldrian
 * desplazadas cinco horas. Va en un unico formateador para que ningun llamador
 * pueda olvidarlo. tests/unit/formato-fechas.test.ts corre en una zona ajena a
 * proposito para que quitarlo se note en cualquier maquina.
 */
export const ZONA_HORARIA = 'America/Bogota'

function formateador(opciones: Intl.DateTimeFormatOptions, locale = 'es-CO'): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, { ...opciones, timeZone: ZONA_HORARIA })
}

export function formatearHora(instante: string | Date): string {
  return formateador({ hour: 'numeric', minute: '2-digit' }).format(new Date(instante))
}

export function formatearDia(instante: string | Date): string {
  return formateador({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(instante))
}

export function formatearFechaHora(instante: string | Date): string {
  return `${formatearDia(instante)}, ${formatearHora(instante)}`
}

/** Fecha de calendario de Bogota, YYYY-MM-DD (en-CA da ese orden). Para agrupar, no para mostrar. */
export function claveDia(instante: string | Date): string {
  return formateador({ year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA').format(new Date(instante))
}
