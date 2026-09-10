/** Parámetros de URL no confiables: los duplicados se ignoran. */
export type ParametrosCatalogo = Record<string, string | string[] | undefined>
const OPERACIONES = ['venta', 'arriendo'] as const
const TIPOS = ['apartamento', 'casa', 'local', 'lote', 'oficina'] as const
export interface FiltrosCatalogo {
  operacion?: typeof OPERACIONES[number]
  tipo?: typeof TIPOS[number]
  precioMin?: number
  precioMax?: number
  pagina: number
}

function precio(valor: string | string[] | undefined): number | undefined {
  if (typeof valor !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(valor)) return undefined
  const numero = Number(valor)
  return numero > 0 && numero <= 999_999_999_999.99 ? numero : undefined
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
  const pagina = parametros.pagina
  if (typeof pagina === 'string' && /^\d+$/.test(pagina)) {
    const numero = Number(pagina)
    if (Number.isSafeInteger(numero) && numero > 0) filtros.pagina = numero
  }
  return filtros
}
