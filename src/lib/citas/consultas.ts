import type { SupabaseClient } from '@supabase/supabase-js'
import { leerRango, type RangoCita } from './rango'

/**
 * Lecturas de SP5. Todas llevan el filtro por usuario EXPLICITO: leads y citas
 * tienen politicas permisivas de comprador y de vendedor combinadas con OR, y
 * un usuario puede estar en los dos papeles (tests/rls/consultas-citas.test.ts).
 *
 * Los embebidos nombran la clave foranea: citas apunta a leads y a propiedades,
 * y sin la pista PostgREST podria ver mas de una relacion (PGRST201).
 */

export type EstadoLead = 'nuevo' | 'aceptado' | 'descartado'
export type EstadoCita = 'confirmada' | 'cancelada'

export interface Franja {
  inicio: string
  fin: string
}

export interface VisitaResumen extends RangoCita {
  id: string
}

export interface SolicitudDelComprador {
  id: string
  estado: EstadoLead
  propiedadId: string
  tituloPropiedad: string | null
  visita: VisitaResumen | null
  direccion: string | null
}

export interface CitaDelVendedor extends RangoCita {
  id: string
  estado: EstadoCita
  tituloPropiedad: string | null
  nombreComprador: string | null
}

export interface LeadParaReservar {
  id: string
  estado: EstadoLead
  vendedorId: string
  tituloPropiedad: string | null
}

export interface CitaDeParticipante extends RangoCita {
  id: string
  estado: EstadoCita
  vendedorId: string
}

export interface FilaDisponibilidad {
  id: string
  dia_semana: number
  hora_inicio: string
  hora_fin: string
}

export interface FechaBloqueada {
  id: string
  desde: string
  hasta: string
}

interface FilaSolicitud {
  id: string
  estado: EstadoLead
  propiedad_id: string
  propiedades: { titulo: string } | null
  citas: { id: string; rango: string; estado: EstadoCita }[] | null
}

export async function listarSolicitudesDelComprador(
  cliente: SupabaseClient, compradorId: string,
): Promise<SolicitudDelComprador[]> {
  const { data, error } = await cliente
    .from('leads')
    .select('id,estado,propiedad_id,propiedades!leads_propiedad_id_fkey(titulo),citas!citas_lead_id_fkey(id,rango,estado)')
    .eq('comprador_id', compradorId)
    .order('creado_en', { ascending: false })
  if (error) throw new Error('No se pudieron cargar tus solicitudes')

  const solicitudes: SolicitudDelComprador[] = ((data ?? []) as unknown as FilaSolicitud[]).map((fila) => {
    const confirmada = (fila.citas ?? []).find((cita) => cita.estado === 'confirmada')
    return {
      id: fila.id,
      estado: fila.estado,
      propiedadId: fila.propiedad_id,
      tituloPropiedad: fila.propiedades?.titulo ?? null,
      visita: confirmada ? { id: confirmada.id, ...leerRango(confirmada.rango) } : null,
      direccion: null,
    }
  })

  const conVisita = solicitudes.filter((s) => s.visita !== null).map((s) => s.propiedadId)
  if (conVisita.length === 0) return solicitudes

  // La direccion se pide SIEMPRE para toda visita confirmada, sin mirar la hora
  // en JavaScript: la politica ubicacion_lectura_comprador_en_ventana decide si
  // la fila vuelve. Poner aqui un "si faltan menos de 2 horas" duplicaria la
  // regla, y si divergen manda la base.
  const { data: ubicaciones } = await cliente
    .from('propiedades_ubicacion')
    .select('propiedad_id,direccion')
    .in('propiedad_id', conVisita)
  const porPropiedad = new Map(
    ((ubicaciones ?? []) as { propiedad_id: string; direccion: string | null }[])
      .map((u) => [u.propiedad_id, u.direccion]),
  )

  return solicitudes.map((s) => (s.visita ? { ...s, direccion: porPropiedad.get(s.propiedadId) ?? null } : s))
}

interface FilaCitaVendedor {
  id: string
  rango: string
  estado: EstadoCita
  propiedades: { titulo: string } | null
  leads: { nombre_mostrado: string } | null
}

export async function listarCitasDelVendedor(
  cliente: SupabaseClient, vendedorId: string,
): Promise<CitaDelVendedor[]> {
  const { data, error } = await cliente
    .from('citas')
    .select('id,rango,estado,propiedades!citas_propiedad_id_fkey(titulo),leads!citas_lead_id_fkey(nombre_mostrado)')
    .eq('vendedor_id', vendedorId)
    // El orden de un rango es el de su limite inferior.
    .order('rango', { ascending: true })
  if (error) throw new Error('No se pudieron cargar tus visitas')

  return ((data ?? []) as unknown as FilaCitaVendedor[]).map((fila) => ({
    id: fila.id,
    estado: fila.estado,
    ...leerRango(fila.rango),
    tituloPropiedad: fila.propiedades?.titulo ?? null,
    nombreComprador: fila.leads?.nombre_mostrado ?? null,
  }))
}

/**
 * Limites abiertos a proposito: el horizonte (now() + 2 h a now() + 14 dias)
 * lo aplica franjas_libres en la base. La aplicacion no calcula fechas.
 */
export async function obtenerFranjasLibres(cliente: SupabaseClient, vendedorId: string): Promise<Franja[]> {
  const { data, error } = await cliente.rpc('franjas_libres', {
    p_vendedor_id: vendedorId, p_desde: '-infinity', p_hasta: 'infinity',
  })
  if (error) throw new Error('No se pudieron cargar las franjas libres')
  return (data ?? []) as Franja[]
}

export async function obtenerLeadParaReservar(
  cliente: SupabaseClient, leadId: string, compradorId: string,
): Promise<LeadParaReservar | null> {
  const { data, error } = await cliente
    .from('leads')
    .select('id,estado,vendedor_id,propiedades!leads_propiedad_id_fkey(titulo)')
    .eq('id', leadId)
    .eq('comprador_id', compradorId)
    .maybeSingle()
  if (error) throw new Error('No se pudo cargar la solicitud')
  if (!data) return null
  const fila = data as unknown as {
    id: string; estado: EstadoLead; vendedor_id: string; propiedades: { titulo: string } | null
  }
  return {
    id: fila.id, estado: fila.estado, vendedorId: fila.vendedor_id,
    tituloPropiedad: fila.propiedades?.titulo ?? null,
  }
}

export async function obtenerCitaDeParticipante(
  cliente: SupabaseClient, citaId: string, usuarioId: string, papel: 'comprador' | 'vendedor',
): Promise<CitaDeParticipante | null> {
  const { data, error } = await cliente
    .from('citas')
    .select('id,estado,vendedor_id,rango')
    .eq('id', citaId)
    .eq(papel === 'comprador' ? 'comprador_id' : 'vendedor_id', usuarioId)
    .maybeSingle()
  if (error) throw new Error('No se pudo cargar la visita')
  if (!data) return null
  const fila = data as { id: string; estado: EstadoCita; vendedor_id: string; rango: string }
  return { id: fila.id, estado: fila.estado, vendedorId: fila.vendedor_id, ...leerRango(fila.rango) }
}

export async function leerDisponibilidad(
  cliente: SupabaseClient, vendedorId: string,
): Promise<FilaDisponibilidad[]> {
  const { data, error } = await cliente
    .from('disponibilidad_semanal')
    .select('id,dia_semana,hora_inicio,hora_fin')
    .eq('vendedor_id', vendedorId)
    .order('dia_semana', { ascending: true })
    .order('hora_inicio', { ascending: true })
  if (error) throw new Error('No se pudo cargar tu horario')
  return (data ?? []) as FilaDisponibilidad[]
}

export async function leerFechasBloqueadas(
  cliente: SupabaseClient, vendedorId: string,
): Promise<FechaBloqueada[]> {
  const { data, error } = await cliente
    .from('fechas_bloqueadas')
    .select('id,desde,hasta')
    .eq('vendedor_id', vendedorId)
    .order('desde', { ascending: true })
  if (error) throw new Error('No se pudieron cargar tus fechas bloqueadas')
  return (data ?? []) as FechaBloqueada[]
}
