import 'server-only'
import { headers } from 'next/headers'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import type { PropiedadDeTarjeta } from '@/components/tarjeta-propiedad'
import type { PinCatalogo } from './catalogo'

export async function cargarMapaCatalogo<P extends PropiedadDeTarjeta>(propiedades: readonly P[], barrioDe: (p: P) => { slug: string } | null) {
  const clave = process.env.MAPS_INTERACTIVE_ENABLED === 'true' ? process.env.GOOGLE_MAPS_BROWSER_KEY ?? null : null
  const mapaId = clave ? process.env.GOOGLE_MAPS_MAP_ID ?? null : null
  const pines: PinCatalogo[] = []
  if (!clave || !mapaId) return { pines, clave: null, mapaId: null }
  const nonce = (await headers()).get('x-nonce') ?? undefined
  const db = crearClientePublico()
  const resultados = await Promise.all(propiedades.slice(0, 12).map(async (p) => {
    const barrio = barrioDe(p)
    if (!barrio || p.precio === null) return null
    const { data, error } = await db.rpc('zona_aproximada_propiedad', { p_propiedad_id: p.id })
    const zona = (data as { latitud: number; longitud: number }[] | null)?.[0]
    if (error || !zona || !Number.isFinite(zona.latitud) || !Number.isFinite(zona.longitud)) return null
    return { id: p.id, titulo: p.titulo, precio: p.precio, operacion: p.operacion, latitud: zona.latitud, longitud: zona.longitud, ruta: `/${barrio.slug}/${p.slug}` }
  }))
  for (const resultado of resultados) if (resultado) pines.push(resultado)
  return { pines, clave, mapaId, nonce }
}