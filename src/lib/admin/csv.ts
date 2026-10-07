/**
 * CSV para abrir en Excel / Google Sheets (RFC 4180: comas y CRLF).
 *
 * Inyeccion de formulas (CSV injection): un titulo como `=HYPERLINK(...)` lo
 * escribe un vendedor cualquiera y se ejecutaria en la hoja del admin. Toda
 * celda de texto que empiece por = + - @ tab o CR se prefija con un apostrofo,
 * que la hoja muestra como texto. Los numeros no pasan por ahi: un precio
 * negativo no existe y no merece convertirse en texto.
 */
export type Celda = string | number | boolean | null | undefined

const INICIO_DE_FORMULA = /^[=+\-@\t\r]/

function celda(valor: Celda): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor !== 'string') return String(valor)
  const texto = INICIO_DE_FORMULA.test(valor) ? `'${valor}` : valor
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export function aCsv(cabecera: readonly string[], filas: readonly (readonly Celda[])[]): string {
  return [cabecera, ...filas].map((fila) => fila.map(celda).join(',')).join('\r\n') + '\r\n'
}

export interface PropiedadModeracionCsv {
  id: string
  titulo: string
  operacion: string
  estado: string
  destacada: boolean
  precio: number | null
  creado_en: string
  vendedor: { nombre: string; telefono?: string | null } | null
  barrios: { nombre: string } | null
}

/**
 * Las columnas del listado de moderacion. El telefono del vendedor NO sale:
 * la pantalla no lo muestra, y un fichero descargado no se puede revocar.
 */
export function filasModeracionCsv(propiedades: readonly PropiedadModeracionCsv[]) {
  return {
    cabecera: ['id', 'titulo', 'barrio', 'operacion', 'estado', 'destacada', 'precio', 'vendedor', 'creado_en'],
    filas: propiedades.map((p) => [
      p.id,
      p.titulo,
      p.barrios?.nombre ?? '',
      p.operacion,
      p.estado,
      p.destacada,
      p.precio,
      p.vendedor?.nombre ?? '',
      p.creado_en,
    ]),
  }
}
