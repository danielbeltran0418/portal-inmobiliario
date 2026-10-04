'use server';

import { redirect } from 'next/navigation';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';

const FORMA_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/**
 * Desactiva las alertas de la busqueda cuyo token_baja llega en el formulario.
 *
 * Es un server action (POST) y no un GET a proposito: los filtros de correo y
 * los antivirus abren por su cuenta los enlaces de los mensajes, y con un GET
 * eso bastaba para dar de baja la alerta sin que el usuario hiciera clic.
 *
 * Se redirige a la confirmacion aunque el token no exista o no tenga forma de
 * UUID: responder distinto diria a quien prueba tokens cuales son validos.
 */
export async function darDeBajaBusqueda(formData: FormData): Promise<void> {
  const token = formData.get('token');

  if (typeof token === 'string' && FORMA_UUID.test(token)) {
    const { error } = await crearClienteAdmin()
      .from('busquedas_guardadas')
      .update({ notificaciones_activas: false })
      .eq('token_baja', token);
    if (error) {
      console.error('[Notificaciones] Error al desactivar busqueda por token_baja:', error);
    }
  }

  redirect('/notificaciones/baja/confirmado');
}
