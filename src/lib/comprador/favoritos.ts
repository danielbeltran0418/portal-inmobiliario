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
    barrio?: { nombre: string } | null;
    imagenes_propiedad?: { ruta_storage: string; orden: number }[];
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
        barrio:barrios (nombre),
        imagenes_propiedad (ruta_storage, orden)
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
