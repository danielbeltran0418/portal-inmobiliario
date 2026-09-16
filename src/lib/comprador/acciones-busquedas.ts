'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor';

const esquemaGuardarBusqueda = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(100, 'Máximo 100 caracteres'),
  filtros: z.record(z.string(), z.unknown()).default({}),
  notificaciones: z.boolean().default(false),
});

export interface ResultadoAccionBusqueda {
  exito: boolean;
  busquedaId?: string;
  error?: string;
}

export async function guardarBusquedaAction(
  nombre: string,
  filtros: Record<string, unknown>,
  notificaciones = false
): Promise<ResultadoAccionBusqueda> {
  const parsed = esquemaGuardarBusqueda.safeParse({ nombre, filtros, notificaciones });
  if (!parsed.success) {
    return { exito: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const supabase = await crearClienteServidor();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) {
    return { exito: false, error: 'Debes iniciar sesión para guardar búsquedas.' };
  }

  const { data, error } = await supabase
    .from('busquedas_guardadas')
    .insert({
      usuario_id: authData.user.id,
      nombre: parsed.data.nombre,
      filtros: parsed.data.filtros,
      notificaciones_activas: parsed.data.notificaciones,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[SP2] Error al guardar búsqueda:', error);
    return { exito: false, error: 'No se pudo guardar la búsqueda.' };
  }

  revalidatePath('/mi-cuenta/busquedas');
  return { exito: true, busquedaId: data.id };
}

export async function eliminarBusquedaAction(
  busquedaId: string
): Promise<ResultadoAccionBusqueda> {
  const supabase = await crearClienteServidor();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) {
    return { exito: false, error: 'Debes iniciar sesión.' };
  }

  const { error } = await supabase
    .from('busquedas_guardadas')
    .delete()
    .eq('id', busquedaId)
    .eq('usuario_id', authData.user.id);

  if (error) {
    console.error('[SP2] Error al eliminar búsqueda:', error);
    return { exito: false, error: 'No se pudo eliminar la búsqueda.' };
  }

  revalidatePath('/mi-cuenta/busquedas');
  return { exito: true };
}
