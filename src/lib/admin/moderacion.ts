import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapearError } from '@/lib/errores/mapear'

export interface ResultadoModeracion {
  ok: boolean
  error?: string
  propiedadId?: string
}

export interface MetadatosModeracion {
  motivo?: string
  accion_especifica: 'suspender' | 'reactivar' | 'eliminar' | 'eliminar_fallida' | 'eliminar_imagen'
  estado_anterior?: string
  estado_nuevo?: string
  imagen_id?: string
  [key: string]: unknown
}

const esquemaId = z.string().uuid('Identificador inválido')
const esquemaMotivo = z
  .string()
  .trim()
  .min(1, 'Se requiere un motivo de moderación.')
  .max(500, 'El motivo no puede superar 500 caracteres.')

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
  const valProp = esquemaId.safeParse(propiedadId)
  if (!valProp.success) {
    return { ok: false, error: 'ID de propiedad inválido.' }
  }

  const valAdmin = esquemaId.safeParse(adminId)
  if (!valAdmin.success) {
    return { ok: false, error: 'ID de administrador inválido.' }
  }

  const valMotivo = esquemaMotivo.safeParse(motivo)
  if (!valMotivo.success) {
    return { ok: false, error: valMotivo.error.issues[0]?.message ?? 'Motivo de moderación inválido.' }
  }

  // 1. Obtener estado anterior
  const { data: anterior, error: errAnterior } = await cliente
    .from('propiedades')
    .select('id, estado')
    .eq('id', valProp.data)
    .single()

  if (errAnterior || !anterior) {
    return { ok: false, error: errAnterior ? mapearError(errAnterior).mensaje : 'Propiedad no encontrada o sin acceso.' }
  }

  // 2. Actualizar estado a 'rechazada' encadenando .select('id')
  const { data: filas, error: errUpdate } = await cliente
    .from('propiedades')
    .update({ estado: 'rechazada' })
    .eq('id', valProp.data)
    .select('id')

  if (errUpdate) {
    return { ok: false, error: mapearError(errUpdate).mensaje }
  }

  if (!filas || filas.length === 0) {
    return { ok: false, error: 'No se pudo suspender la propiedad.' }
  }

  // 3. Registrar auditoría inmutable comprobando error
  const { error: errAuditoria } = await clienteAdmin.rpc('registrar_evento_auditoria', {
    p_accion: 'propiedad_moderada',
    p_entidad: 'propiedades',
    p_entidad_id: valProp.data,
    p_actor_id: valAdmin.data,
    p_metadatos: {
      accion_especifica: 'suspender',
      estado_anterior: anterior.estado,
      estado_nuevo: 'rechazada',
      motivo: valMotivo.data,
    },
    p_ip: null,
  })

  if (errAuditoria) {
    return { ok: false, error: mapearError(errAuditoria).mensaje }
  }

  return { ok: true, propiedadId: valProp.data }
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
  const valProp = esquemaId.safeParse(propiedadId)
  if (!valProp.success) {
    return { ok: false, error: 'ID de propiedad inválido.' }
  }

  const valAdmin = esquemaId.safeParse(adminId)
  if (!valAdmin.success) {
    return { ok: false, error: 'ID de administrador inválido.' }
  }

  const { data: anterior, error: errAnterior } = await cliente
    .from('propiedades')
    .select('id, estado')
    .eq('id', valProp.data)
    .single()

  if (errAnterior || !anterior) {
    return { ok: false, error: errAnterior ? mapearError(errAnterior).mensaje : 'Propiedad no encontrada.' }
  }

  const { data: filas, error: errUpdate } = await cliente
    .from('propiedades')
    .update({ estado: 'publicada' })
    .eq('id', valProp.data)
    .select('id')

  if (errUpdate) {
    return { ok: false, error: mapearError(errUpdate).mensaje }
  }

  if (!filas || filas.length === 0) {
    return { ok: false, error: 'No se pudo reactivar la propiedad.' }
  }

  const { error: errAuditoria } = await clienteAdmin.rpc('registrar_evento_auditoria', {
    p_accion: 'propiedad_moderada',
    p_entidad: 'propiedades',
    p_entidad_id: valProp.data,
    p_actor_id: valAdmin.data,
    p_metadatos: {
      accion_especifica: 'reactivar',
      estado_anterior: anterior.estado,
      estado_nuevo: 'publicada',
    },
    p_ip: null,
  })

  if (errAuditoria) {
    return { ok: false, error: mapearError(errAuditoria).mensaje }
  }

  return { ok: true, propiedadId: valProp.data }
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
  const valProp = esquemaId.safeParse(propiedadId)
  if (!valProp.success) {
    return { ok: false, error: 'ID de propiedad inválido.' }
  }

  const valAdmin = esquemaId.safeParse(adminId)
  if (!valAdmin.success) {
    return { ok: false, error: 'ID de administrador inválido.' }
  }

  const valMotivo = esquemaMotivo.safeParse(motivo)
  if (!valMotivo.success) {
    return { ok: false, error: valMotivo.error.issues[0]?.message ?? 'Motivo de eliminación inválido.' }
  }

  // Registrar auditoría antes de eliminar para conservar el enlace entidad_id
  const { error: errAuditoria } = await clienteAdmin.rpc('registrar_evento_auditoria', {
    p_accion: 'propiedad_moderada',
    p_entidad: 'propiedades',
    p_entidad_id: valProp.data,
    p_actor_id: valAdmin.data,
    p_metadatos: {
      accion_especifica: 'eliminar',
      motivo: valMotivo.data,
    },
    p_ip: null,
  })

  if (errAuditoria) {
    return { ok: false, error: mapearError(errAuditoria).mensaje }
  }

  const { data: filas, error: errDelete } = await cliente
    .from('propiedades')
    .delete()
    .eq('id', valProp.data)
    .select('id')

  if (errDelete || !filas || filas.length === 0) {
    // registro_auditoria es inmutable: el evento de arriba ya dice 'eliminar'.
    // Este lo desmiente, para que el rastro no afirme un borrado que no ocurrio.
    const { error: errCompensacion } = await clienteAdmin.rpc('registrar_evento_auditoria', {
      p_accion: 'propiedad_moderada',
      p_entidad: 'propiedades',
      p_entidad_id: valProp.data,
      p_actor_id: valAdmin.data,
      p_metadatos: { accion_especifica: 'eliminar_fallida', motivo: valMotivo.data },
      p_ip: null,
    })
    if (errCompensacion) {
      console.error('[moderacion] No se pudo registrar el evento compensatorio de eliminar_fallida:', errCompensacion)
    }
    return {
      ok: false,
      error: errDelete ? mapearError(errDelete).mensaje : 'No se pudo eliminar la propiedad.',
    }
  }

  return { ok: true, propiedadId: valProp.data }
}
