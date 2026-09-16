'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';

const esquemaPerfil = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  telefono: z.string().trim().max(20).optional().nullable(),
});

export interface ResultadoAccionDatos {
  exito: boolean;
  error?: string;
}

export async function actualizarPerfilCompradorAction(
  datos: { nombre: string; telefono?: string | null }
): Promise<ResultadoAccionDatos> {
  const parsed = esquemaPerfil.safeParse(datos);
  if (!parsed.success) {
    return { exito: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const supabase = await crearClienteServidor();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) {
    return { exito: false, error: 'Debes iniciar sesión.' };
  }

  const { error } = await supabase
    .from('perfiles')
    .update({
      nombre: parsed.data.nombre,
      telefono: parsed.data.telefono ?? null,
    })
    .eq('id', authData.user.id);

  if (error) {
    console.error('[SP2] Error al actualizar perfil:', error);
    return { exito: false, error: 'No se pudo actualizar el perfil.' };
  }

  revalidatePath('/mi-cuenta/datos');
  revalidatePath('/mi-cuenta');
  return { exito: true };
}

export async function suprimirCuentaCompradorAction(
  confirmacion: string
): Promise<ResultadoAccionDatos> {
  if (confirmacion !== 'ELIMINAR MI CUENTA') {
    return {
      exito: false,
      error: 'Debes escribir exactamente "ELIMINAR MI CUENTA" para confirmar.',
    };
  }

  const supabase = await crearClienteServidor();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) {
    return { exito: false, error: 'No autenticado.' };
  }

  const usuarioId = authData.user.id;
  const admin = crearClienteAdmin();

  try {
    // 1. Borrar datos no críticos / preferencias privadas del comprador
    await admin.from('favoritos').delete().eq('usuario_id', usuarioId);
    await admin.from('busquedas_guardadas').delete().eq('usuario_id', usuarioId);

    // 2. Cerrar conversaciones de IA
    await admin
      .from('conversaciones_ia')
      .update({ estado_conversacion: 'cerrada' })
      .eq('comprador_id', usuarioId);

    // 3. Cancelar citas futuras
    const { data: leads } = await admin
      .from('leads')
      .select('id')
      .eq('comprador_id', usuarioId);

    const leadIds = (leads ?? []).map((l) => l.id);
    if (leadIds.length > 0) {
      await admin
        .from('citas')
        .update({
          estado: 'cancelada',
          notas: 'Cancelada automáticamente por supresión de cuenta de usuario.',
        })
        .in('lead_id', leadIds)
        .eq('estado', 'confirmada');

      // 4. Anonimizar datos de contacto en leads
      await admin
        .from('leads_contacto')
        .update({
          nombre: 'Usuario Anónimo',
          telefono: null,
          email: 'anonimo@baja.portal.test',
        })
        .in('lead_id', leadIds);
    }

    // 5. Anonimizar perfil y marcar suprimido_en
    await admin
      .from('perfiles')
      .update({
        nombre: 'Usuario dado de baja',
        telefono: null,
        suprimido_en: new Date().toISOString(),
      })
      .eq('id', usuarioId);

    // 6. Auditoría
    await admin.rpc('registrar_evento_auditoria', {
      p_accion: 'cuenta_suprimida',
      p_entidad: 'perfiles',
      p_entidad_id: usuarioId,
      p_actor_id: usuarioId,
      p_metadatos: { motivo: 'Habeas Data / Derecho al Olvido ejercido por el titular' },
      p_ip: null,
    });

    // 7. Borrado de credenciales en Supabase Auth
    const { error: errAuth } = await admin.auth.admin.deleteUser(usuarioId);
    if (errAuth) {
      console.warn('[SP2] Advertencia al eliminar usuario de auth:', errAuth.message);
    }

    // 8. Cerrar sesión cliente
    await supabase.auth.signOut();

    return { exito: true };
  } catch (error) {
    console.error('[SP2] Error al suprimir cuenta:', error);
    return {
      exito: false,
      error: 'Ocurrió un error inesperado al procesar la supresión de cuenta.',
    };
  }
}
