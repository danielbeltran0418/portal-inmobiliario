/** Longitud maxima de la parte legible, antes del sufijo. */
const LONGITUD_MAXIMA_BASE = 60

/**
 * El generador interno solo produce esto, pero un llamador (el reintento ante
 * colision de la Task 7/8) puede pasar su propio sufijo: se exige el mismo
 * patron para que nunca llegue a incumplir el CHECK de la base.
 */
const PATRON_SUFIJO = /^[a-z0-9]+$/

/**
 * El slug se genera UNA vez, al crear la propiedad, y no cambia nunca mas
 * aunque el vendedor edite el titulo: un slug que muta rompe los enlaces ya
 * publicados y es de lo peor que se le puede hacer al SEO.
 */
export function generarSlug(titulo: string, sufijo: string = sufijoAleatorio()): string {
  if (!PATRON_SUFIJO.test(sufijo)) {
    throw new Error(
      `generarSlug: sufijo invalido "${sufijo}". Se esperaba [a-z0-9]+ (p. ej. hex en minusculas, como produce el generador interno).`
    )
  }

  const base = titulo
    .normalize('NFD')
    // Rango de diacriticos combinantes, escrito con escapes: los caracteres
    // literales se corrompen al copiar entre editores con codificaciones
    // distintas, y este fichero se edita en Windows.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const recortado = recortarSinPartirPalabra(base, LONGITUD_MAXIMA_BASE)
  return `${recortado || 'propiedad'}-${sufijo}`
}

function recortarSinPartirPalabra(valor: string, maximo: number): string {
  if (valor.length <= maximo) return valor
  const corte = valor.lastIndexOf('-', maximo)
  const trozo = corte > 0 ? valor.slice(0, corte) : valor.slice(0, maximo)
  // Un guion final romperia el CHECK '^[a-z0-9]+(-[a-z0-9]+)*$'.
  return trozo.replace(/-+$/, '')
}

/** 4 hex = 65.536 combinaciones. La colision se resuelve reintentando (Task 7). */
function sufijoAleatorio(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(2))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
