'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor';

export interface ResultadoConmutarFavorito {
  exito: boolean;
  favorito?: boolean;
  error?: string;
}

export async function conmutarFavoritoAction(
  propiedadId: string
): Promise<ResultadoConmutarFavorito> {
  const supabase = await crearClienteServidor();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) {
    return {
      exito: false,
      error: 'Debes iniciar sesión para guardar favoritos.',
    };
  }

  const usuarioId = authData.user.id;

  // 1. Verificar si ya existe
  const { data: existente, error: errConsulta } = await supabase
    .from('favoritos')
    .select('id')
    .eq('usuario_id', usuarioId)
    .eq('propiedad_id', propiedadId)
    .maybeSingle();

  if (errConsulta) {
    console.error('[SP2] Error al consultar favorito:', errConsulta);
    return { exito: false, error: 'No se pudo verificar el estado del favorito.' };
  }

  if (existente) {
    // Eliminar de favoritos
    const { error: errBorrado } = await supabase
      .from('favoritos')
      .delete()
      .eq('id', existente.id);

    if (errBorrado) {
      console.error('[SP2] Error al eliminar favorito:', errBorrado);
      return { exito: false, error: 'No se pudo eliminar de favoritos.' };
    }

    revalidatePath('/mi-cuenta/favoritos');
    revalidatePath(`/propiedades/${propiedadId}`);
    return { exito: true, favorito: false };
  } else {
    // Agregar a favoritos
    const { error: errInsercion } = await supabase
      .from('favoritos')
      .insert({
        usuario_id: usuarioId,
        propiedad_id: propiedadId,
      });

    if (errInsercion) {
      console.error('[SP2] Error al agregar favorito:', errInsercion);
      return { exito: false, error: 'No se pudo agregar a favoritos.' };
    }

    revalidatePath('/mi-cuenta/favoritos');
    revalidatePath(`/propiedades/${propiedadId}`);
    return { exito: true, favorito: true };
  }
}
