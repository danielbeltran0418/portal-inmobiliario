export interface PropiedadParaCompletitud {
  descripcion: string | null
  barrio_id: string | null
  precio: number | null
  numeroDeImagenes: number
}

const DESCRIPCION_MINIMA = 40

/**
 * Lo que le falta a una propiedad para poder publicarse, en texto para el
 * vendedor. Vacio = lista.
 *
 * Solo "Al menos una foto" esta ademas garantizado por la base (trigger
 * propiedades_exigir_imagen). Los otros tres son guia del panel: se eligio
 * publicacion directa, no moderacion.
 */
export function faltantesParaPublicar(p: PropiedadParaCompletitud): string[] {
  const faltan: string[] = []
  if (p.numeroDeImagenes < 1) faltan.push('Al menos una foto')
  if (!p.barrio_id) faltan.push('El barrio')
  if (!p.precio || p.precio <= 0) faltan.push('El precio')
  if ((p.descripcion ?? '').trim().length < DESCRIPCION_MINIMA) {
    faltan.push(`Una descripcion de al menos ${DESCRIPCION_MINIMA} caracteres`)
  }
  return faltan
}
