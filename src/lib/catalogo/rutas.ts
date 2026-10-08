import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Primer segmento de cada ruta propia de la app. Un barrio con uno de estos
 * slugs quedaria tapado por la ruta (o la taparia), asi que la base tambien
 * los prohibe (ultima version: migracion 20261015000100). tests/unit/rutas-reservadas.test.ts
 * comprueba que la lista cubre todas las carpetas de src/app.
 */
export const RUTAS_RESERVADAS = [
  'api', 'buscar', 'catalogo', 'ciudad', 'confirmar', 'control', 'doble-factor', 'imagen', 'login',
  'mi-cuenta', 'notificaciones', 'panel', 'recuperar', 'registro', 'restablecer', 'sitemaps',
  'verificar-correo',
] as const
const RESERVADAS = new Set<string>(RUTAS_RESERVADAS)

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
