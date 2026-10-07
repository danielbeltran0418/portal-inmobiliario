import type { SupabaseClient } from '@supabase/supabase-js';

export interface PropiedadFavorita {
  id: string;
  propiedad_id: string;
  creado_en: string;
  propiedad: {
    id: string;
    slug: string;
    titulo: string;
    precio: number;
    moneda: string;
    operacion: string;
    tipo_inmueble: string;
    habitaciones: number | null;
    banos: number | null;
    area_m2: number | null;
    barrio?: { nombre: string; slug: string } | null;
    imagenes_propiedad?: { id: string; alt_text: string; orden: number }[];
  };
}

export async function obtenerFavoritosUsuario(
  supabase: SupabaseClient,
  usuarioId: string
): Promise<PropiedadFavorita[]> {
  const { data, error } = await supabase
    .from('favoritos')
    .select(`
      id,
      propiedad_id,
      creado_en,
      propiedad:propiedades (
        id,
        slug,
        titulo,
        precio,
        moneda,
        operacion,
        tipo_inmueble,
        habitaciones,
        banos,
        area_m2,
        barrio:barrios (nombre, slug),
        imagenes_propiedad (id, alt_text, orden)
      )
    `)
    .eq('usuario_id', usuarioId)
    .order('creado_en', { ascending: false });

  if (error || !data) {
    console.error('[SP2] Error al obtener favoritos:', error);
    return [];
  }

  return (data as unknown) as PropiedadFavorita[];
}

export async function esFavorito(
  supabase: SupabaseClient,
  usuarioId: string,
  propiedadId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('favoritos')
    .select('id')
    .eq('usuario_id', usuarioId)
    .eq('propiedad_id', propiedadId)
    .maybeSingle();

  if (error) {
    console.error('[SP2] Error al verificar favorito:', error);
    return false;
  }

  return !!data;
}

/**
 * Cuales de las propiedades listadas (una pagina del catalogo) tiene el usuario
 * en favoritos. Una sola consulta acotada a esos ids; un fallo no rompe el
 * catalogo: los corazones salen vacios y el clic los corrige.
 */
export async function idsFavoritos(
  supabase: SupabaseClient,
  usuarioId: string,
  propiedadIds: readonly string[]
): Promise<Set<string>> {
  if (propiedadIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('favoritos')
    .select('propiedad_id')
    .eq('usuario_id', usuarioId)
    .in('propiedad_id', [...propiedadIds]);

  if (error) {
    console.error('[favoritos] No se pudieron leer los favoritos del listado:', error);
    return new Set();
  }

  return new Set((data ?? []).map((f: { propiedad_id: string }) => f.propiedad_id));
}
