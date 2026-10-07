/** Parámetros de URL no confiables: los duplicados se ignoran. */
export type ParametrosCatalogo = Record<string, string | string[] | undefined>
const OPERACIONES = ['venta', 'arriendo'] as const
const TIPOS = ['apartamento', 'casa', 'local', 'lote', 'oficina'] as const
export interface FiltrosCatalogo {
  operacion?: typeof OPERACIONES[number]
  tipo?: typeof TIPOS[number]
  precioMin?: number
  precioMax?: number
  /** Palabras clave ya saneadas: solo letras, numeros y espacios simples. */
  texto?: string
  pagina: number
}

function precio(valor: string | string[] | undefined): number | undefined {
  if (typeof valor !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(valor)) return undefined
  const numero = Number(valor)
  return numero > 0 && numero <= 999_999_999_999.99 ? numero : undefined
}

const LARGO_MAXIMO_TEXTO = 60

/**
 * Texto libre de la URL. Se queda SOLO con letras, numeros y espacios: el valor
 * acaba dentro de un filtro or() de PostgREST, donde comas, parentesis, puntos,
 * comillas y comodines (* % _) cambiarian la consulta. Menos de 2 caracteres
 * no filtra nada util.
 */
function texto(valor: string | string[] | undefined): string | undefined {
  if (typeof valor !== 'string') return undefined
  const limpio = valor.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, LARGO_MAXIMO_TEXTO).trim()
  return limpio.length >= 2 ? limpio : undefined
}

/** Normaliza filtros GET sin trasladar valores arbitrarios a la consulta. */
export function leerFiltros(parametros: ParametrosCatalogo): FiltrosCatalogo {
  const filtros: FiltrosCatalogo = { pagina: 1 }
  const operacion = OPERACIONES.find(valor => valor === parametros.operacion)
  const tipo = TIPOS.find(valor => valor === parametros.tipo)
  if (operacion) filtros.operacion = operacion
  if (tipo) filtros.tipo = tipo
  const minimo = precio(parametros.precio_min)
  const maximo = precio(parametros.precio_max)
  if (!(minimo !== undefined && maximo !== undefined && minimo > maximo)) {
    if (minimo !== undefined) filtros.precioMin = minimo
    if (maximo !== undefined) filtros.precioMax = maximo
  }
  const palabras = texto(parametros.q)
  if (palabras) filtros.texto = palabras
  const pagina = parametros.pagina
  if (typeof pagina === 'string' && /^\d+$/.test(pagina)) {
    const numero = Number(pagina)
    if (Number.isSafeInteger(numero) && numero > 0) filtros.pagina = numero
  }
  return filtros
}
