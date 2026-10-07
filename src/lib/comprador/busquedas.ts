import type { SupabaseClient } from '@supabase/supabase-js';
import { leerFiltros } from '@/lib/catalogo/filtros';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Filtros que se guardan de una busqueda: los del catalogo, validados con la
 * misma regla que la URL (leerFiltros), y el barrio como slug. Antes se
 * guardaba el objeto que mandara el cliente tal cual, en un jsonb sin tope.
 */
export function normalizarFiltrosGuardados(entrada: Record<string, unknown>): Record<string, string | number> {
  const texto = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : undefined);
  const filtros = leerFiltros({
    operacion: texto(entrada.operacion),
    tipo: texto(entrada.tipo),
    precio_min: texto(entrada.precio_min),
    precio_max: texto(entrada.precio_max),
    q: texto(entrada.q),
  });
  const salida: Record<string, string | number> = {};
  const barrio = texto(entrada.barrio);
  if (barrio && barrio.length <= 80 && SLUG.test(barrio)) salida.barrio = barrio;
  if (filtros.operacion) salida.operacion = filtros.operacion;
  if (filtros.tipo) salida.tipo = filtros.tipo;
  if (filtros.precioMin !== undefined) salida.precio_min = filtros.precioMin;
  if (filtros.precioMax !== undefined) salida.precio_max = filtros.precioMax;
  if (filtros.texto) salida.q = filtros.texto;
  return salida;
}

/** Nombre legible de cada filtro guardado, para la tarjeta de Mis busquedas. */
export const ETIQUETA_FILTRO: Record<string, string> = {
  operacion: 'Operación',
  tipo: 'Tipo',
  precio_min: 'Precio mínimo',
  precio_max: 'Precio máximo',
  q: 'Palabras clave',
};

export interface BusquedaGuardada {
  id: string;
  usuario_id: string;
  nombre: string;
  filtros: Record<string, unknown>;
  notificaciones_activas: boolean;
  creado_en: string;
  actualizado_en: string;
}

export function construirQueryStringBusqueda(filtros: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') {
      params.set(clave, String(valor));
    }
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

export async function obtenerBusquedasGuardadas(
  supabase: SupabaseClient,
  usuarioId: string
): Promise<BusquedaGuardada[]> {
  const { data, error } = await supabase
    .from('busquedas_guardadas')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('creado_en', { ascending: false });

  if (error || !data) {
    console.error('[SP2] Error al obtener búsquedas guardadas:', error);
    return [];
  }

  return data as BusquedaGuardada[];
}
