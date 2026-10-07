import type { SupabaseClient } from '@supabase/supabase-js'
import type { FiltrosCatalogo } from './filtros'

export const TAMANO_PAGINA = 12
// La lista explícita evita que una columna nueva se exponga por accidente.
const COLUMNAS_LISTADO = 'id,slug,titulo,operacion,tipo_inmueble,precio,moneda,habitaciones,banos,area_m2,actualizado_en,imagenes_propiedad!inner(id,alt_text,orden)'

export async function listarPropiedadesPublicas(cliente: SupabaseClient, barrioId: string, filtros: FiltrosCatalogo) {
  const inicio = (filtros.pagina - 1) * TAMANO_PAGINA
  if (!Number.isSafeInteger(inicio) || inicio < 0 || !Number.isSafeInteger(inicio + TAMANO_PAGINA - 1)) {
    throw new Error('Página fuera de rango')
  }
  let consulta = cliente.from('propiedades')
    .select(COLUMNAS_LISTADO, { count: 'exact' })
    .eq('estado', 'publicada').eq('barrio_id', barrioId)
  if (filtros.operacion) consulta = consulta.eq('operacion', filtros.operacion)
  if (filtros.tipo) consulta = consulta.eq('tipo_inmueble', filtros.tipo)
  if (filtros.precioMin !== undefined) consulta = consulta.gte('precio', filtros.precioMin)
  if (filtros.precioMax !== undefined) consulta = consulta.lte('precio', filtros.precioMax)
  // filtros.texto ya viene saneado (leerFiltros): solo letras, numeros y espacios.
  if (filtros.texto) {
    const patron = `"*${filtros.texto}*"`
    consulta = consulta.or(`titulo.ilike.${patron},descripcion.ilike.${patron}`)
  }
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
