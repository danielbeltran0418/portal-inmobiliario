import type { SupabaseClient } from '@supabase/supabase-js'

const LIMITE_BANDEJA = 200

export interface LeadDeBandeja {
  id: string
  nombre_mostrado: string
  mensaje: string
  estado: 'nuevo' | 'aceptado' | 'descartado'
  creado_en: string
  propiedades: { titulo: string; slug: string } | null
  leads_contacto: { correo: string; telefono: string } | null
}

/**
 * La bandeja. `leads_contacto` se pide SIEMPRE, sin condicion en el cliente: la
 * politica de RLS decide si vuelve o no segun el estado del lead. Poner aqui un
 * "solo si aceptado" duplicaria la regla en dos sitios, y el sitio que manda es
 * la base -- si algun dia divergen, gana la base y este filtro solo serviria
 * para ocultar un fallo.
 *
 * Filtro explicito por vendedor_id (CN-011): las politicas RLS SELECT de leads
 * se combinan con OR, asi que consultar sin filtro explicito podria devolver
 * filas ajenas si el usuario tuviera acceso por otro rol o relacion.
 */
export async function listarLeadsDelVendedor(
  cliente: SupabaseClient,
  vendedorId: string,
): Promise<LeadDeBandeja[]> {
  const { data, error } = await cliente
    .from('leads')
    .select('id,nombre_mostrado,mensaje,estado,creado_en,propiedades(titulo,slug),leads_contacto(correo,telefono)')
    .eq('vendedor_id', vendedorId)
    .order('estado', { ascending: true })
    .order('creado_en', { ascending: false })
    // Sin tope, PostgREST corta en 1000 filas sin avisar y cada fila pinta
    // componentes de cliente. Con el orden de arriba entran primero los nuevos.
    .limit(LIMITE_BANDEJA)
  if (error) throw new Error('No se pudo cargar la bandeja de leads')
  return (data ?? []) as unknown as LeadDeBandeja[]
}

export async function contarLeadsNuevos(
  cliente: SupabaseClient,
  vendedorId: string,
): Promise<number> {
  const { count, error } = await cliente
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('vendedor_id', vendedorId)
    .eq('estado', 'nuevo')
  // Un contador que falla no debe tumbar el panel entero: se degrada a cero.
  if (error) return 0
  return count ?? 0
}
