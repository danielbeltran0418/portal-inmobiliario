export interface RangoCita {
  /** ISO 8601 en UTC (`...Z`). */
  inicio: string
  fin: string
}

// ["2026-09-17 20:00:00+00","2026-09-17 21:00:00+00")  -- las citas siempre son '[)'.
const FORMA_RANGO = /^\[\s*"?([^",]+?)"?\s*,\s*"?([^",]+?)"?\s*\)$/

function aIso(valor: string): string {
  // "2026-09-17 20:00:00.123+00" -> "2026-09-17T20:00:00.123+00:00", que Date lee en cualquier motor.
  const normalizado = valor.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  const instante = new Date(normalizado)
  if (Number.isNaN(instante.getTime())) {
    throw new Error(`Instante de cita ilegible: ${valor}`)
  }
  return instante.toISOString()
}

/** Convierte el tstzrange que devuelve PostgREST en dos instantes ISO. No calcula nada. */
export function leerRango(rango: string): RangoCita {
  const partes = FORMA_RANGO.exec(rango)
  if (!partes) throw new Error(`Rango de cita ilegible: ${rango}`)
  return { inicio: aIso(partes[1]!), fin: aIso(partes[2]!) }
}
