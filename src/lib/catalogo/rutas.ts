import type { SupabaseClient } from '@supabase/supabase-js'
const RESERVADAS = new Set(['panel', 'mi-cuenta', 'control', 'imagen', 'catalogo', 'login', 'registro', 'confirmar', 'verificar-correo'])
export function esRutaFicha(ruta: string): boolean {
  const partes = ruta.split('/')
  return /^\/[a-z0-9-]+\/[a-z0-9-]+$/.test(ruta) && !RESERVADAS.has(partes[1])
}
type Decision = { estado: 200 | 404 | 410 } | { estado: 301; destino: string }
/** Solo usa cliente anónimo: no consulta borradores ni estado privado. */
export async function resolverRutaPublica(db: SupabaseClient, ruta: string): Promise<Decision> {
  const { data: historia, error: eh } = await db.from('rutas_publicas_propiedad').select('propiedad_id').eq('ruta', ruta).maybeSingle()
  if (eh) throw new Error('No se pudo resolver la URL pública')
  let consulta = db.from('propiedades').select('slug,barrios!inner(slug)').eq('estado', 'publicada')
  consulta = historia ? consulta.eq('id', historia.propiedad_id) : consulta.eq('slug', ruta.split('/')[2])
  const { data: propiedad, error } = await consulta.maybeSingle()
  if (error) throw new Error('No se pudo resolver la URL pública')
  if (!propiedad) return { estado: historia ? 410 : 404 }
  const barrio = Array.isArray(propiedad.barrios) ? propiedad.barrios[0] : propiedad.barrios
  if (!barrio) return { estado: historia ? 410 : 404 }
  const destino = `/${barrio.slug}/${propiedad.slug}`
  if (destino === ruta) return { estado: 200 }
  return historia ? { estado: 301, destino } : { estado: 404 }
}
