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
  estratoMin?: number
  estratoMax?: number
  habitacionesMin?: number
  banosMin?: number
  parqueaderosMin?: number
  administracionMax?: number
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

/** Entero de la URL dentro de [min, max]; cualquier otra cosa se ignora. */
function entero(valor: string | string[] | undefined, min: number, max: number): number | undefined {
  if (typeof valor !== 'string' || !/^\d{1,3}$/.test(valor)) return undefined
  const numero = Number(valor)
  return numero >= min && numero <= max ? numero : undefined
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
  const estratoMin = entero(parametros.estrato_min, 1, 6)
  const estratoMax = entero(parametros.estrato_max, 1, 6)
  if (!(estratoMin !== undefined && estratoMax !== undefined && estratoMin > estratoMax)) {
    if (estratoMin !== undefined) filtros.estratoMin = estratoMin
    if (estratoMax !== undefined) filtros.estratoMax = estratoMax
  }
  const habitacionesMin = entero(parametros.habitaciones_min, 1, 20)
  if (habitacionesMin !== undefined) filtros.habitacionesMin = habitacionesMin
  const banosMin = entero(parametros.banos_min, 1, 20)
  if (banosMin !== undefined) filtros.banosMin = banosMin
  const parqueaderosMin = entero(parametros.parqueaderos_min, 1, 20)
  if (parqueaderosMin !== undefined) filtros.parqueaderosMin = parqueaderosMin
  const administracionMax = precio(parametros.administracion_max)
  if (administracionMax !== undefined) filtros.administracionMax = administracionMax
  const palabras = texto(parametros.q)
  if (palabras) filtros.texto = palabras
  const pagina = parametros.pagina
  if (typeof pagina === 'string' && /^\d+$/.test(pagina)) {
    const numero = Number(pagina)
    if (Number.isSafeInteger(numero) && numero > 0) filtros.pagina = numero
  }
  return filtros
}

/**
 * Filtros a parametros de URL, en un orden fijo. Lo usan la paginacion del
 * catalogo, /buscar y las busquedas guardadas: un solo sitio que conoce los
 * nombres de la URL.
 */
export function parametrosDeFiltros(filtros: Omit<FiltrosCatalogo, 'pagina'> & { pagina?: number }): URLSearchParams {
  const p = new URLSearchParams()
  const poner = (clave: string, valor: string | number | undefined) => {
    if (valor !== undefined) p.set(clave, String(valor))
  }
  poner('operacion', filtros.operacion)
  poner('tipo', filtros.tipo)
  poner('precio_min', filtros.precioMin)
  poner('precio_max', filtros.precioMax)
  poner('estrato_min', filtros.estratoMin)
  poner('estrato_max', filtros.estratoMax)
  poner('habitaciones_min', filtros.habitacionesMin)
  poner('banos_min', filtros.banosMin)
  poner('parqueaderos_min', filtros.parqueaderosMin)
  poner('administracion_max', filtros.administracionMax)
  poner('q', filtros.texto)
  if (filtros.pagina !== undefined && filtros.pagina > 1) p.set('pagina', String(filtros.pagina))
  return p
}
