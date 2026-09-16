import type { SupabaseClient } from '@supabase/supabase-js'

export interface MensajeIAResumen {
  id: string
  emisor: 'comprador' | 'agente_ia' | 'sistema'
  contenido: string
  creado_en: string
}

export interface ConversacionIAResumen {
  id: string
  lead_id: string
  estado_conversacion: string
  franja_propuesta: string | null
  mensajes: MensajeIAResumen[]
}

export interface CitaPropuestaResumen {
  id: string
  conversacion_id: string
  lead_id: string
  propiedad_titulo: string | null
  comprador_nombre: string | null
  franja_propuesta: string
}

interface FilaConversacionBD {
  id: string
  lead_id: string
  estado_conversacion: string
  franja_propuesta: string | null
  mensajes_ia: MensajeIAResumen[] | null
}

interface FilaCitaPropuestaBD {
  id: string
  lead_id: string
  franja_propuesta: string
  propiedades: { titulo: string } | null
  leads: { nombre_mostrado: string } | null
}

export async function listarConversacionesVendedor(
  cliente: SupabaseClient,
  vendedorId: string,
): Promise<Record<string, ConversacionIAResumen>> {
  if (typeof cliente?.from !== 'function') return {}

  const { data, error } = await cliente
    .from('conversaciones_ia')
    .select('id, lead_id, estado_conversacion, franja_propuesta, mensajes_ia(id, emisor, contenido, creado_en)')
    .eq('vendedor_id', vendedorId)
  if (error || !data) return {}

  const mapa: Record<string, ConversacionIAResumen> = {}
  for (const row of (data as unknown as FilaConversacionBD[])) {
    mapa[row.lead_id] = {
      id: row.id,
      lead_id: row.lead_id,
      estado_conversacion: row.estado_conversacion,
      franja_propuesta: row.franja_propuesta,
      mensajes: ((row.mensajes_ia || [])).sort(
        (a, b) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime(),
      ),
    }
  }
  return mapa
}

export async function listarCitasPropuestas(
  cliente: SupabaseClient,
  vendedorId: string,
): Promise<CitaPropuestaResumen[]> {
  if (typeof cliente?.from !== 'function') return []

  const { data, error } = await cliente
    .from('conversaciones_ia')
    .select('id, lead_id, franja_propuesta, propiedades(titulo), leads(nombre_mostrado)')
    .eq('vendedor_id', vendedorId)
    .eq('estado_conversacion', 'cita_propuesta')
    .not('franja_propuesta', 'is', null)
  if (error || !data) return []

  return (data as unknown as FilaCitaPropuestaBD[]).map((row) => ({
    id: row.id,
    conversacion_id: row.id,
    lead_id: row.lead_id,
    propiedad_titulo: row.propiedades?.titulo ?? null,
    comprador_nombre: row.leads?.nombre_mostrado ?? null,
    franja_propuesta: row.franja_propuesta,
  }))
}

export async function leerAutoConfirmacion(
  cliente: SupabaseClient,
  vendedorId: string,
): Promise<boolean> {
  if (typeof cliente?.from !== 'function') return false

  const { data } = await cliente
    .from('disponibilidad_semanal')
    .select('auto_confirmar_citas')
    .eq('vendedor_id', vendedorId)
    .limit(1)
    .maybeSingle()
  return data?.auto_confirmar_citas === true
}

export async function listarConversacionesComprador(
  cliente: SupabaseClient,
  compradorId: string,
): Promise<Record<string, ConversacionIAResumen>> {
  if (typeof cliente?.from !== 'function') return {}

  const { data, error } = await cliente
    .from('conversaciones_ia')
    .select('id, lead_id, estado_conversacion, franja_propuesta, mensajes_ia(id, emisor, contenido, creado_en)')
    .eq('comprador_id', compradorId)
  if (error || !data) return {}

  const mapa: Record<string, ConversacionIAResumen> = {}
  for (const row of (data as unknown as FilaConversacionBD[])) {
    mapa[row.lead_id] = {
      id: row.id,
      lead_id: row.lead_id,
      estado_conversacion: row.estado_conversacion,
      franja_propuesta: row.franja_propuesta,
      mensajes: ((row.mensajes_ia || [])).sort(
        (a, b) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime(),
      ),
    }
  }
  return mapa
}
