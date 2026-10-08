'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';
import { accionBloqueada, registrarIntentoAccion } from '@/lib/auth/limite-intentos';
import { ipDeConfianza } from '@/lib/http/ip-cliente';

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

const MENSAJE_CONTRASENA_SUPRESION = 'La contraseña no es correcta.';
const MENSAJE_SUPRESION_BLOQUEADA =
  'Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentarlo.';

/**
 * Comprueba la contrasena actual sin tocar la sesion del navegador: un cliente
 * aparte, sin persistencia, que inicia sesion y la cierra al momento.
 */
async function contrasenaCorrecta(correo: string, password: string): Promise<boolean> {
  const cliente = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { data, error } = await cliente.auth.signInWithPassword({ email: correo, password });
  if (error || !data.session) return false;
  await cliente.auth.signOut({ scope: 'local' });
  return true;
}

/**
 * Supresion de la cuenta del comprador (Habeas Data).
 *
 * Exige la contrasena actual (hallazgo L3 de la auditoria): borrar la cuenta
 * es irreversible, y con solo una sesion abierta -- un equipo compartido, una
 * sesion robada -- bastaba escribir la frase. Los fallos cuentan en el mismo
 * limite que el login (5 por correo en 15 minutos): si no, este formulario
 * seria una forma de adivinar contrasenas sin el limite del login.
 */
export async function suprimirCuentaCompradorAction(
  confirmacion: string,
  password: string,
): Promise<ResultadoAccionDatos> {
  if (confirmacion !== 'ELIMINAR MI CUENTA') {
    return {
      exito: false,
      error: 'Debes escribir exactamente "ELIMINAR MI CUENTA" para confirmar.',
    };
  }
  if (typeof password !== 'string' || password.length === 0 || password.length > 72) {
    return { exito: false, error: 'Escribe tu contraseña actual para confirmar.' };
  }

  const supabase = await crearClienteServidor();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user?.email) {
    return { exito: false, error: 'No autenticado.' };
  }

  const usuarioId = authData.user.id;
  const correo = authData.user.email;
  const admin = crearClienteAdmin();

  // Solo cuentas de comprador: un vendedor o un super_admin que llamara a esta
  // accion borraria sus propiedades o el acceso de administracion.
  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', usuarioId).maybeSingle();
  if (perfil?.rol !== 'comprador') {
    return { exito: false, error: 'Esta opción solo está disponible para cuentas de comprador.' };
  }

  const ip = ipDeConfianza(await headers());
  if (await accionBloqueada('login', correo, ip)) {
    return { exito: false, error: MENSAJE_SUPRESION_BLOQUEADA };
  }
  if (!(await contrasenaCorrecta(correo, password))) {
    const quedoRegistrado = await registrarIntentoAccion('login', correo, ip, false);
    return { exito: false, error: quedoRegistrado ? MENSAJE_CONTRASENA_SUPRESION : MENSAJE_SUPRESION_BLOQUEADA };
  }

  // Borrar la cuenta de Auth arrastra en CASCADA (ON DELETE CASCADE) perfiles,
  // leads, leads_contacto, citas, favoritos, busquedas_guardadas,
  // conversaciones_ia y mensajes_ia. Por eso NO se toca ni se anonimiza nada
  // antes (el codigo anterior ademas escribia columnas que no existen en
  // leads_contacto y no miraba ningun error): si Auth falla, la cuenta queda
  // entera y el titular puede reintentar.
  const { error: errAuth } = await admin.auth.admin.deleteUser(usuarioId);
  if (errAuth) {
    console.error('[CN-006] Error al eliminar usuario de auth:', errAuth);
    return { exito: false, error: 'No se pudo eliminar la cuenta. Intenta de nuevo.' };
  }

  // La auditoria va DESPUES: registro_auditoria es inmutable y un evento
  // anterior afirmaria una supresion que Auth todavia podia rechazar.
  // registrar_evento_auditoria resuelve actor_id con un SELECT sobre perfiles,
  // asi que con el perfil ya borrado el actor queda NULL (sin violar la FK) y
  // entidad_id conserva el uuid para la traza de Habeas Data.
  const { error: errAuditoria } = await admin.rpc('registrar_evento_auditoria', {
    p_accion: 'cuenta_suprimida',
    p_entidad: 'perfiles',
    p_entidad_id: usuarioId,
    p_actor_id: usuarioId,
    p_metadatos: { motivo: 'Habeas Data / Derecho al Olvido ejercido por el titular' },
    p_ip: null,
  });
  if (errAuditoria) {
    // La cuenta ya no existe: devolver error aqui le diria al titular que no
    // se borro algo que si se borro. Se registra para que alguien lo repare.
    console.error('[CN-006] Cuenta suprimida pero la auditoria fallo:', usuarioId, errAuditoria);
  }

  // El token ya no vale; signOut limpia las cookies. Un fallo aqui no cambia
  // que la cuenta esta borrada.
  await supabase.auth.signOut().catch(() => undefined);

  return { exito: true };
}
