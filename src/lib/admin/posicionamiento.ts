import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapearError } from '@/lib/errores/mapear'

const esquemaId = z.string().uuid('Identificador inválido')
const esquemaMotivo = z
  .string()
  .trim()
  .min(1, 'Se requiere un motivo.')
  .max(500, 'El motivo no puede superar 500 caracteres.')

export const esquemaPagoPosicionamiento = z
  .object({
    propiedad_id: z.string().uuid('ID de propiedad inválido'),
    monto: z.coerce.number().min(0, 'El monto no puede ser negativo'),
    moneda: z.string().min(1).default('COP'),
    fecha_inicio: z.string().datetime({ message: 'Fecha de inicio inválida' }),
    fecha_fin: z.string().datetime({ message: 'Fecha de fin inválida' }),
    notas: z.string().optional().nullable(),
    referencia_externa: z.string().optional().nullable(),
  })
  .refine(
    (data) => new Date(data.fecha_fin) > new Date(data.fecha_inicio),
    {
      message: 'La fecha de fin debe ser posterior a la fecha de inicio',
      path: ['fecha_fin'],
    },
  )

export type DatosPagoPosicionamiento = z.infer<typeof esquemaPagoPosicionamiento>

export interface ResultadoPagoPosicionamiento {
  ok: boolean
  error?: string
  pagoId?: string
}

export interface PagoPosicionamientoConDetalle {
  id: string
  propiedad_id: string
  vendedor_id: string
  monto: number
  moneda: string
  fecha_inicio: string
  fecha_fin: string
  estado: 'activo' | 'expirado' | 'cancelado'
  notas: string | null
  referencia_externa: string | null
  creado_en: string
  propiedades?: {
    titulo: string
    slug: string
    estado: string
    destacada: boolean
  } | null
  perfiles?: {
    nombre: string
    telefono: string | null
  } | null
}

/**
 * Registra manualmente un acuerdo de posicionamiento pagado para destacar una propiedad.
 */
export async function registrarPagoPosicionamiento(
  cliente: SupabaseClient,
  clienteAdmin: SupabaseClient,
  datosRaw: unknown,
  adminId: string,
): Promise<ResultadoPagoPosicionamiento> {
  const valAdmin = esquemaId.safeParse(adminId)
  if (!valAdmin.success) {
    return { ok: false, error: 'ID de administrador inválido.' }
  }

  const validacion = esquemaPagoPosicionamiento.safeParse(datosRaw)
  if (!validacion.success) {
    const primerError = validacion.error.issues[0]?.message ?? 'Datos de pago inválidos'
    return { ok: false, error: primerError }
  }

  const datos = validacion.data

  // 1. Obtener vendedor_id y comprobar que la propiedad existe
  const { data: prop, error: errProp } = await cliente
    .from('propiedades')
    .select('id, vendedor_id, estado')
    .eq('id', datos.propiedad_id)
    .single()

  if (errProp || !prop) {
    return { ok: false, error: 'Propiedad no encontrada para aplicar posicionamiento.' }
  }

  // 2. Insertar pago de posicionamiento
  const { data: nuevoPago, error: errInsert } = await cliente
    .from('pagos_posicionamiento')
    .insert({
      propiedad_id: datos.propiedad_id,
      vendedor_id: prop.vendedor_id,
      monto: datos.monto,
      moneda: datos.moneda,
      fecha_inicio: datos.fecha_inicio,
      fecha_fin: datos.fecha_fin,
      estado: 'activo',
      registrado_por: valAdmin.data,
      notas: datos.notas ?? null,
      referencia_externa: datos.referencia_externa ?? null,
    })
    .select('id')
    .single()

  if (errInsert || !nuevoPago) {
    return { ok: false, error: errInsert ? mapearError(errInsert).mensaje : 'Error al registrar el pago.' }
  }

  // 3. Registrar auditoría comprobando error
  const { error: errAuditoria } = await clienteAdmin.rpc('registrar_evento_auditoria', {
    p_accion: 'posicionamiento_activado',
    p_entidad: 'pagos_posicionamiento',
    p_entidad_id: nuevoPago.id,
    p_actor_id: valAdmin.data,
    p_metadatos: {
      propiedad_id: datos.propiedad_id,
      vendedor_id: prop.vendedor_id,
      monto: datos.monto,
      moneda: datos.moneda,
      fecha_inicio: datos.fecha_inicio,
      fecha_fin: datos.fecha_fin,
      referencia_externa: datos.referencia_externa ?? null,
    },
    p_ip: null,
  })

  if (errAuditoria) {
    return { ok: false, error: mapearError(errAuditoria).mensaje }
  }

  return { ok: true, pagoId: nuevoPago.id }
}

/**
 * Cancela un acuerdo de posicionamiento pagado.
 */
export async function cancelarPagoPosicionamiento(
  cliente: SupabaseClient,
  clienteAdmin: SupabaseClient,
  pagoId: string,
  motivo: string,
  adminId: string,
): Promise<ResultadoPagoPosicionamiento> {
  const valPago = esquemaId.safeParse(pagoId)
  if (!valPago.success) {
    return { ok: false, error: 'ID del acuerdo inválido.' }
  }

  const valAdmin = esquemaId.safeParse(adminId)
  if (!valAdmin.success) {
    return { ok: false, error: 'ID de administrador inválido.' }
  }

  const valMotivo = esquemaMotivo.safeParse(motivo)
  if (!valMotivo.success) {
    return { ok: false, error: valMotivo.error.issues[0]?.message ?? 'Motivo de cancelación inválido.' }
  }

  const { data: pago, error: errPago } = await cliente
    .from('pagos_posicionamiento')
    .select('id, propiedad_id, estado')
    .eq('id', valPago.data)
    .single()

  if (errPago || !pago) {
    return { ok: false, error: 'Acuerdo de posicionamiento no encontrado.' }
  }

  const { data: filas, error: errUpdate } = await cliente
    .from('pagos_posicionamiento')
    .update({ estado: 'cancelado' })
    .eq('id', valPago.data)
    .select('id')

  if (errUpdate) {
    return { ok: false, error: mapearError(errUpdate).mensaje }
  }

  if (!filas || filas.length === 0) {
    return { ok: false, error: 'Acuerdo de posicionamiento no encontrado o ya cancelado.' }
  }

  const { error: errAuditoria } = await clienteAdmin.rpc('registrar_evento_auditoria', {
    p_accion: 'posicionamiento_cancelado',
    p_entidad: 'pagos_posicionamiento',
    p_entidad_id: valPago.data,
    p_actor_id: valAdmin.data,
    p_metadatos: {
      propiedad_id: pago.propiedad_id,
      estado_anterior: pago.estado,
      motivo: valMotivo.data,
    },
    p_ip: null,
  })

  if (errAuditoria) {
    return { ok: false, error: mapearError(errAuditoria).mensaje }
  }

  return { ok: true, pagoId: valPago.data }
}

/**
 * Consulta todos los acuerdos de posicionamiento con información de propiedad y vendedor.
 */
export async function listarPagosPosicionamiento(
  cliente: SupabaseClient,
): Promise<PagoPosicionamientoConDetalle[]> {
  const { data, error } = await cliente
    .from('pagos_posicionamiento')
    .select(`
      id,
      propiedad_id,
      vendedor_id,
      monto,
      moneda,
      fecha_inicio,
      fecha_fin,
      estado,
      notas,
      referencia_externa,
      creado_en,
      propiedades (titulo, slug, estado, destacada),
      perfiles:vendedor_id (nombre, telefono)
    `)
    .order('creado_en', { ascending: false })

  if (error || !data) {
    return []
  }

  return data as unknown as PagoPosicionamientoConDetalle[]
}
