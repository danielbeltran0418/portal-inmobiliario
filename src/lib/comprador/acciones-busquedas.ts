'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor';
import { normalizarFiltrosGuardados } from '@/lib/comprador/busquedas';
import { mapearError } from '@/lib/errores/mapear';

const esquemaGuardarBusqueda = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(100, 'Máximo 100 caracteres'),
  filtros: z.record(z.string(), z.unknown()).default({}),
  notificaciones: z.boolean().default(false),
});

const esquemaIdBusqueda = z.string().uuid('Identificador inválido');

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
      filtros: normalizarFiltrosGuardados(parsed.data.filtros),
      notificaciones_activas: parsed.data.notificaciones,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[SP2] Error al guardar búsqueda:', error);
    return { exito: false, error: error ? mapearError(error).mensaje : 'No se pudo guardar la búsqueda.' };
  }

  revalidatePath('/mi-cuenta/busquedas');
  return { exito: true, busquedaId: data.id };
}

export async function eliminarBusquedaAction(
  busquedaId: string
): Promise<ResultadoAccionBusqueda> {
  const validId = esquemaIdBusqueda.safeParse(busquedaId);
  if (!validId.success) {
    return { exito: false, error: validId.error.issues[0]?.message ?? 'Identificador inválido' };
  }

  const supabase = await crearClienteServidor();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) {
    return { exito: false, error: 'Debes iniciar sesión.' };
  }

  // Verifica que el usuario tenga rol comprador (CN-010)
  const { data: perfil, error: errPerfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', authData.user.id)
    .single();

  if (errPerfil || !perfil || perfil.rol !== 'comprador') {
    return { exito: false, error: 'Solo compradores pueden eliminar búsquedas.' };
  }

  const { data: filas, error } = await supabase
    .from('busquedas_guardadas')
    .delete()
    .eq('id', validId.data)
    .eq('usuario_id', authData.user.id)
    .select('id');

  if (error) {
    console.error('[SP2] Error al eliminar búsqueda:', error);
    return { exito: false, error: mapearError(error).mensaje };
  }

  if (!filas || filas.length === 0) {
    return { exito: false, error: 'Búsqueda no encontrada.' };
  }

  revalidatePath('/mi-cuenta/busquedas');
  return { exito: true };
}
