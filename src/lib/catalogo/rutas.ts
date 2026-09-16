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
  if (!historia) return { estado: 200 }

  const { data: propiedad, error } = await db.from('propiedades').select('slug,barrios!inner(slug)').eq('estado', 'publicada').eq('id', historia.propiedad_id).maybeSingle()
  if (error) throw new Error('No se pudo resolver la URL pública')
  if (!propiedad) return { estado: 410 }
  const barrio = Array.isArray(propiedad.barrios) ? propiedad.barrios[0] : propiedad.barrios
  if (!barrio) return { estado: 410 }
  const destino = `/${barrio.slug}/${propiedad.slug}`
  if (destino === ruta) return { estado: 200 }
  return { estado: 301, destino }
}
