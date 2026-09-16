import type { SupabaseClient } from '@supabase/supabase-js'

export interface ResultadoModeracion {
  ok: boolean
  error?: string
  propiedadId?: string
}

export interface MetadatosModeracion {
  motivo?: string
  accion_especifica: 'suspender' | 'reactivar' | 'eliminar' | 'eliminar_imagen'
  estado_anterior?: string
  estado_nuevo?: string
  imagen_id?: string
  [key: string]: unknown
}

/**
 * Suspende o rechaza una propiedad por motivos de moderación (infracción de términos,
 * contenido inapropiado, fraude o datos incorrectos).
 */
export async function suspenderPropiedad(
  cliente: SupabaseClient,
  clienteAdmin: SupabaseClient,
  propiedadId: string,
  motivo: string,
  adminId: string,
): Promise<ResultadoModeracion> {
  if (!propiedadId || !motivo.trim()) {
    return { ok: false, error: 'Se requiere el ID de la propiedad y un motivo de suspensión.' }
  }

  // 1. Obtener estado anterior
  const { data: anterior, error: errAnterior } = await cliente
    .from('propiedades')
    .select('id, estado')
    .eq('id', propiedadId)
    .single()

  if (errAnterior || !anterior) {
    return { ok: false, error: 'Propiedad no encontrada o sin acceso.' }
  }

  // 2. Actualizar estado a 'rechazada'
  const { error: errUpdate } = await cliente
    .from('propiedades')
    .update({ estado: 'rechazada' })
    .eq('id', propiedadId)

  if (errUpdate) {
    return { ok: false, error: 'No se pudo suspender la propiedad: ' + errUpdate.message }
  }

  // 3. Registrar auditoría inmutable
  await clienteAdmin.rpc('registrar_evento_auditoria', {
    p_accion: 'propiedad_moderada',
    p_entidad: 'propiedades',
    p_entidad_id: propiedadId,
    p_actor_id: adminId,
    p_metadatos: {
      accion_especifica: 'suspender',
      estado_anterior: anterior.estado,
      estado_nuevo: 'rechazada',
      motivo: motivo.trim(),
    },
    p_ip: null,
  })

  return { ok: true, propiedadId }
}

/**
 * Reactiva una propiedad previamente rechazada o pausada, regresándola a 'publicada'.
 */
export async function reactivarPropiedad(
  cliente: SupabaseClient,
  clienteAdmin: SupabaseClient,
  propiedadId: string,
  adminId: string,
): Promise<ResultadoModeracion> {
  if (!propiedadId) {
    return { ok: false, error: 'Se requiere el ID de la propiedad.' }
  }

  const { data: anterior, error: errAnterior } = await cliente
    .from('propiedades')
    .select('id, estado')
    .eq('id', propiedadId)
    .single()

  if (errAnterior || !anterior) {
    return { ok: false, error: 'Propiedad no encontrada.' }
  }

  const { error: errUpdate } = await cliente
    .from('propiedades')
    .update({ estado: 'publicada' })
    .eq('id', propiedadId)

  if (errUpdate) {
    return { ok: false, error: 'No se pudo reactivar la propiedad: ' + errUpdate.message }
  }

  await clienteAdmin.rpc('registrar_evento_auditoria', {
    p_accion: 'propiedad_moderada',
    p_entidad: 'propiedades',
    p_entidad_id: propiedadId,
    p_actor_id: adminId,
    p_metadatos: {
      accion_especifica: 'reactivar',
      estado_anterior: anterior.estado,
      estado_nuevo: 'publicada',
    },
    p_ip: null,
  })

  return { ok: true, propiedadId }
}

/**
 * Elimina definitivamente una propiedad del catálogo.
 */
export async function eliminarPropiedadAdmin(
  cliente: SupabaseClient,
  clienteAdmin: SupabaseClient,
  propiedadId: string,
  motivo: string,
  adminId: string,
): Promise<ResultadoModeracion> {
  if (!propiedadId || !motivo.trim()) {
    return { ok: false, error: 'Se requiere el ID de la propiedad y un motivo de eliminación.' }
  }

  // Registrar auditoría antes de eliminar para conservar el enlace entidad_id
  await clienteAdmin.rpc('registrar_evento_auditoria', {
    p_accion: 'propiedad_moderada',
    p_entidad: 'propiedades',
    p_entidad_id: propiedadId,
    p_actor_id: adminId,
    p_metadatos: {
      accion_especifica: 'eliminar',
      motivo: motivo.trim(),
    },
    p_ip: null,
  })

  const { error: errDelete } = await cliente
    .from('propiedades')
    .delete()
    .eq('id', propiedadId)

  if (errDelete) {
    return { ok: false, error: 'No se pudo eliminar la propiedad: ' + errDelete.message }
  }

  return { ok: true, propiedadId }
}
