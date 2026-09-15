import { claveDia, formatearDia, formatearHora } from '@/lib/fechas/formato'
import type { Franja } from './consultas'

export interface GrupoFranjas {
  /** YYYY-MM-DD de Bogota. */
  clave: string
  /** 'jueves, 17 de septiembre'. */
  dia: string
  franjas: { inicio: string; hora: string }[]
}

/**
 * Agrupa por dia de calendario de Bogota, conservando el orden en que llegan
 * (franjas_libres ya las devuelve ordenadas). No calcula ni filtra fechas.
 */
export function agruparFranjasPorDia(franjas: readonly Franja[]): GrupoFranjas[] {
  const grupos = new Map<string, GrupoFranjas>()
  for (const franja of franjas) {
    const clave = claveDia(franja.inicio)
    let grupo = grupos.get(clave)
    if (!grupo) {
      grupo = { clave, dia: formatearDia(franja.inicio), franjas: [] }
      grupos.set(clave, grupo)
    }
    grupo.franjas.push({ inicio: franja.inicio, hora: formatearHora(franja.inicio) })
  }
  return [...grupos.values()]
}
