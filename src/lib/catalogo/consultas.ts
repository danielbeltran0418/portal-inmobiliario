import type { SupabaseClient } from '@supabase/supabase-js'
import type { FiltrosCatalogo } from './filtros'

export const TAMANO_PAGINA = 12
// La lista explícita evita que una columna nueva se exponga por accidente.
const COLUMNAS_LISTADO = 'id,slug,titulo,operacion,tipo_inmueble,precio,moneda,habitaciones,banos,area_m2,estrato,parqueaderos,actualizado_en,imagenes_propiedad!inner(id,alt_text,orden)'

/**
 * Filtro or() de PostgREST para las palabras clave: titulo o descripcion.
 * `texto` TIENE que venir de leerFiltros (solo letras, numeros y espacios): es
 * lo que impide que una coma, un parentesis o un comodin cambien la consulta.
 */
export function filtroTextoLibre(texto: string): string {
  const patron = `"*${texto}*"`
  return `titulo.ilike.${patron},descripcion.ilike.${patron}`
}

interface ConsultaFiltrable {
  eq(columna: string, valor: string): ConsultaFiltrable
  gte(columna: string, valor: number): ConsultaFiltrable
  lte(columna: string, valor: number): ConsultaFiltrable
  or(filtro: string): ConsultaFiltrable
}

/**
 * Los filtros del catalogo sobre una consulta de `propiedades`. Lo comparten el
 * catalogo y los avisos de busquedas guardadas: un filtro nuevo se anade aqui
 * una sola vez y los dos lo aplican igual. `filtros` TIENE que venir de
 * leerFiltros (valores ya validados).
 */
export function aplicarFiltros<T>(consulta: T, filtros: Omit<FiltrosCatalogo, 'pagina'>): T {
  let q = consulta as unknown as ConsultaFiltrable
  if (filtros.operacion) q = q.eq('operacion', filtros.operacion)
  if (filtros.tipo) q = q.eq('tipo_inmueble', filtros.tipo)
  if (filtros.precioMin !== undefined) q = q.gte('precio', filtros.precioMin)
  if (filtros.precioMax !== undefined) q = q.lte('precio', filtros.precioMax)
  if (filtros.estratoMin !== undefined) q = q.gte('estrato', filtros.estratoMin)
  if (filtros.estratoMax !== undefined) q = q.lte('estrato', filtros.estratoMax)
  if (filtros.habitacionesMin !== undefined) q = q.gte('habitaciones', filtros.habitacionesMin)
  if (filtros.banosMin !== undefined) q = q.gte('banos', filtros.banosMin)
  if (filtros.parqueaderosMin !== undefined) q = q.gte('parqueaderos', filtros.parqueaderosMin)
  if (filtros.administracionMax !== undefined) q = q.lte('administracion', filtros.administracionMax)
  if (filtros.texto) q = q.or(filtroTextoLibre(filtros.texto))
  return q as unknown as T
}

export async function listarPropiedadesPublicas(cliente: SupabaseClient, barrioId: string, filtros: FiltrosCatalogo) {
  const inicio = (filtros.pagina - 1) * TAMANO_PAGINA
  if (!Number.isSafeInteger(inicio) || inicio < 0 || !Number.isSafeInteger(inicio + TAMANO_PAGINA - 1)) {
    throw new Error('Página fuera de rango')
  }
  let consulta = cliente.from('propiedades')
    .select(COLUMNAS_LISTADO, { count: 'exact' })
    .eq('estado', 'publicada').eq('barrio_id', barrioId)
  consulta = aplicarFiltros(consulta, filtros)
  const { data, error, count } = await consulta
    .order('actualizado_en', { ascending: false }).order('id', { ascending: false })
    .range(inicio, inicio + TAMANO_PAGINA - 1)
  if (error) throw new Error('No se pudo cargar el catálogo')
  return { propiedades: data ?? [], total: count ?? 0 }
}

const LIMITE_RECIENTES = 6

/**
 * Propiedades para la portada: publicadas, con al menos una foto y con su
 * barrio (la tarjeta enlaza a /{barrio}/{slug}). Las destacadas (posicionamiento
 * pagado) van primero; despues, las mas nuevas. Un fallo no tumba la portada:
 * devuelve lista vacia y la seccion simplemente no se pinta.
 */
export async function listarRecientes(cliente: SupabaseClient, limite = LIMITE_RECIENTES) {
  const { data, error } = await cliente.from('propiedades')
    .select(`${COLUMNAS_LISTADO},barrios!inner(slug,nombre)`)
    .eq('estado', 'publicada')
    .order('destacada', { ascending: false })
    .order('actualizado_en', { ascending: false })
    .limit(limite)
  if (error) return []
  return data ?? []
}
