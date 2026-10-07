import type { SupabaseClient } from '@supabase/supabase-js';
import { leerFiltros, parametrosDeFiltros } from '@/lib/catalogo/filtros';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Filtros que se guardan de una busqueda: los del catalogo, validados con la
 * misma regla que la URL (leerFiltros), y el barrio como slug. Antes se
 * guardaba el objeto que mandara el cliente tal cual, en un jsonb sin tope.
 */
export function normalizarFiltrosGuardados(entrada: Record<string, unknown>): Record<string, string | number> {
  const crudos: Record<string, string | undefined> = {};
  for (const [clave, valor] of Object.entries(entrada)) {
    if (typeof valor === 'string' || typeof valor === 'number') crudos[clave] = String(valor);
  }
  const salida: Record<string, string | number> = {};
  const barrio = crudos.barrio;
  if (barrio && barrio.length <= 80 && SLUG.test(barrio)) salida.barrio = barrio;
  // Mismos nombres y valores que la URL del catalogo (parametrosDeFiltros):
  // la tarjeta de Mis busquedas los vuelve a convertir en un enlace tal cual.
  for (const [clave, valor] of parametrosDeFiltros({ ...leerFiltros(crudos), pagina: undefined })) {
    salida[clave] = CLAVES_DE_TEXTO.has(clave) ? valor : Number(valor);
  }
  return salida;
}

const CLAVES_DE_TEXTO = new Set(['operacion', 'tipo', 'q']);

/** Nombre legible de cada filtro guardado, para la tarjeta de Mis busquedas. */
export const ETIQUETA_FILTRO: Record<string, string> = {
  operacion: 'Operación',
  tipo: 'Tipo',
  precio_min: 'Precio mínimo',
  precio_max: 'Precio máximo',
  q: 'Palabras clave',
  estrato_min: 'Estrato desde',
  estrato_max: 'Estrato hasta',
  habitaciones_min: 'Habitaciones (mín.)',
  banos_min: 'Baños (mín.)',
  parqueaderos_min: 'Parqueaderos (mín.)',
  administracion_max: 'Administración máx.',
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
