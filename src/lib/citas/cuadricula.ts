/**
 * Modelo de la cuadricula semanal de disponibilidad (diseño de Figma Make).
 *
 * Una celda es (dia ISO 1-7, hora 0-23) y representa la visita de una hora que
 * empieza a esa hora. La base guarda rangos [hora_inicio, hora_fin) que pueden
 * solaparse (las franjas libres se calculan con DISTINCT); la cuadricula los
 * aplana a un conjunto de horas y, al guardar, los vuelve a fundir en rangos
 * contiguos.
 */
export interface FranjaSemanal {
  id: string
  dia_semana: number
  hora_inicio: string
  hora_fin: string
}

const hora = (t: string) => Number(t.slice(0, 2))
const texto = (h: number) => `${String(h).padStart(2, '0')}:00`

export function horasCubiertas(franjas: readonly FranjaSemanal[], dia: number): Set<number> {
  const horas = new Set<number>()
  for (const f of franjas) {
    if (f.dia_semana !== dia) continue
    for (let h = hora(f.hora_inicio); h < hora(f.hora_fin); h++) horas.add(h)
  }
  return horas
}

export function rangosDesdeHoras(horas: ReadonlySet<number>): { hora_inicio: string; hora_fin: string }[] {
  const orden = [...horas].sort((a, b) => a - b)
  const rangos: { hora_inicio: string; hora_fin: string }[] = []
  let inicio: number | null = null
  for (let i = 0; i < orden.length; i++) {
    const h = orden[i]!
    if (inicio === null) inicio = h
    if (orden[i + 1] !== h + 1) {
      rangos.push({ hora_inicio: texto(inicio), hora_fin: texto(h + 1) })
      inicio = null
    }
  }
  return rangos
}

/** 06:00-21:00 por defecto (16 filas); se amplia si hay franjas fuera de ese rango. */
export function horasVisibles(franjas: readonly FranjaSemanal[]): number[] {
  let desde = 6
  let hasta = 21
  for (const f of franjas) {
    desde = Math.min(desde, hora(f.hora_inicio))
    hasta = Math.max(hasta, hora(f.hora_fin) - 1)
  }
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i)
}

export function textoHora(h: number): string {
  return texto(h)
}
