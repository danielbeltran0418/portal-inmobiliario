import type { SupabaseClient } from '@supabase/supabase-js';

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
