import type { SupabaseClient } from '@supabase/supabase-js'

export interface FiltrosAuditoria {
  accion?: string
  entidad?: string
  actor_id?: string
  desde?: string
  hasta?: string
}

export interface PaginacionAuditoria {
  pagina?: number
  porPagina?: number
}

export interface EventoAuditoria {
  id: number
  actor_id: string | null
  accion: string
  entidad: string
  entidad_id: string | null
  metadatos: Record<string, unknown>
  ip: string | null
  creado_en: string
  perfiles?: {
    nombre: string
  } | null
}

export interface ResultadoConsultaAuditoria {
  eventos: EventoAuditoria[]
  total: number
  pagina: number
  totalPaginas: number
}

/**
 * Consulta y pagina los eventos inmutables del registro de auditoría con filtros avanzados.
 */
export async function consultarEventosAuditoria(
  cliente: SupabaseClient,
  filtros: FiltrosAuditoria = {},
  paginacion: PaginacionAuditoria = {},
): Promise<ResultadoConsultaAuditoria> {
  const pagina = Math.max(1, paginacion.pagina ?? 1)
  const porPagina = Math.min(100, Math.max(1, paginacion.porPagina ?? 20))
  const desdeFila = (pagina - 1) * porPagina
  const hastaFila = desdeFila + porPagina - 1

  let consulta = cliente
    .from('registro_auditoria')
    .select(`
      id,
      actor_id,
      accion,
      entidad,
      entidad_id,
      metadatos,
      ip,
      creado_en,
      perfiles:actor_id (nombre)
    `, { count: 'exact' })

  if (filtros.accion?.trim()) {
    consulta = consulta.eq('accion', filtros.accion.trim())
  }

  if (filtros.entidad?.trim()) {
    consulta = consulta.eq('entidad', filtros.entidad.trim())
  }

  if (filtros.actor_id?.trim()) {
    consulta = consulta.eq('actor_id', filtros.actor_id.trim())
  }

  if (filtros.desde?.trim()) {
    consulta = consulta.gte('creado_en', filtros.desde.trim())
  }

  if (filtros.hasta?.trim()) {
    consulta = consulta.lte('creado_en', filtros.hasta.trim())
  }

  consulta = consulta
    .order('creado_en', { ascending: false })
    .range(desdeFila, hastaFila)

  const { data, count, error } = await consulta

  if (error || !data) {
    return {
      eventos: [],
      total: 0,
      pagina,
      totalPaginas: 0,
    }
  }

  const total = count ?? 0
  const totalPaginas = Math.ceil(total / porPagina)

  return {
    eventos: data as unknown as EventoAuditoria[],
    total,
    pagina,
    totalPaginas,
  }
}
