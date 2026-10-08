'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
import { mapearError } from '@/lib/errores/mapear'

const esquemaPerfil = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  telefono: z.string().trim().max(20).optional().nullable(),
})

export interface ResultadoAccionDatos {
  exito: boolean
  error?: string
}

export async function actualizarPerfilCompradorAction(
  datos: { nombre: string; telefono?: string | null }
): Promise<ResultadoAccionDatos> {
  const parsed = esquemaPerfil.safeParse(datos)
  if (!parsed.success) {
    return { exito: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const supabase = await crearClienteServidor()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData?.user) {
    return { exito: false, error: 'Debes iniciar sesión.' }
  }

  const { error } = await supabase
    .from('perfiles')
    .update({
      nombre: parsed.data.nombre,
      telefono: parsed.data.telefono ?? null,
    })
    .eq('id', authData.user.id)

  if (error) {
    console.error('[SP2] Error al actualizar perfil:', error)
    return { exito: false, error: 'No se pudo actualizar el perfil.' }
  }

  revalidatePath('/mi-cuenta/datos')
  revalidatePath('/mi-cuenta')
  return { exito: true }
}

const CONFIRMACION_SUPRESION = 'ELIMINAR MI CUENTA'

export async function suprimirCuentaCompradorAction(
  confirmacion: string
): Promise<ResultadoAccionDatos> {
  if (confirmacion !== CONFIRMACION_SUPRESION) {
    return {
      exito: false,
      error: 'Debes escribir exactamente "ELIMINAR MI CUENTA" para confirmar.',
    }
  }

  const supabase = await crearClienteServidor()
  const { data: authData, error: errAuthUser } = await supabase.auth.getUser()

  if (errAuthUser || !authData?.user) {
    return { exito: false, error: 'No autenticado.' }
  }

  const usuarioId = authData.user.id

  // 1. Verificar que el rol en perfiles sea estrictamente 'comprador'.
  const { data: perfil, error: errPerfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', usuarioId)
    .single()

  if (errPerfil || !perfil || perfil.rol !== 'comprador') {
    return {
      exito: false,
      error: 'Solo los compradores pueden suprimir su cuenta desde esta acción.',
    }
  }

  const admin = crearClienteAdmin()

  // 2. Registrar evento de auditoría antes de eliminar las credenciales.
  // registro_auditoria.actor_id tiene ON DELETE SET NULL, por lo que la traza perdura anónima.
  const { error: errAuditoria } = await admin.rpc('registrar_evento_auditoria', {
    p_accion: 'cuenta_suprimida',
    p_entidad: 'perfiles',
    p_entidad_id: usuarioId,
    p_actor_id: usuarioId,
    p_metadatos: { motivo: 'Habeas Data / Derecho al Olvido ejercido por el titular' },
    p_ip: null,
  })

  if (errAuditoria) {
    console.error('[CN-006] Error al registrar evento de auditoría:', errAuditoria)
    return {
      exito: false,
      error: mapearError(errAuditoria).mensaje,
    }
  }

  // 3. Borrado definitivo de la cuenta en Supabase Auth.
  // Hecho clave: el borrado de auth.users propaga en CASCADA (ON DELETE CASCADE)
  // en Postgres hacia perfiles, leads, leads_contacto, citas, favoritos,
  // busquedas_guardadas, conversaciones_ia y mensajes_ia.
  // NO se debe tocar ni anonimizar nada antes para evitar dejar la cuenta a medio borrar si Auth falla.
  const { error: errAuth } = await admin.auth.admin.deleteUser(usuarioId)
  if (errAuth) {
    console.error('[CN-006] Error al eliminar usuario de auth:', errAuth)
    return {
      exito: false,
      error: 'No se pudo eliminar la cuenta de usuario.',
    }
  }

  // 4. Cerrar sesión en el cliente
  await supabase.auth.signOut()

  return { exito: true }
}
