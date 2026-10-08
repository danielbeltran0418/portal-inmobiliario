import type { SupabaseClient } from '@supabase/supabase-js'
import { urlPublica } from './seo'

/** Por debajo del tope de 50.000 URLs del protocolo, con margen. */
export const FICHAS_POR_SITEMAP = 40_000
const LOTE = 1000

const SELECT_FICHAS = 'id,slug,actualizado_en,barrios!inner(slug),imagenes_propiedad!inner(id)'

/** Cuantos /sitemaps/fichas/{n} hacen falta (al menos 1, aunque este vacio). */
export async function numeroDeSitemapsDeFichas(db: SupabaseClient): Promise<number> {
  const { count, error } = await db.from('propiedades')
    .select(SELECT_FICHAS, { count: 'exact', head: true })
    .eq('estado', 'publicada')
  if (error) throw new Error('No se pudo contar las fichas del sitemap')
  return Math.max(1, Math.ceil((count ?? 0) / FICHAS_POR_SITEMAP))
}

export interface EntradaSitemap {
  url: string
  lastModified?: string
}

/** Las fichas del sitemap numero `n` (0, 1, ...), en lotes de 1000 por consulta. */
export async function fichasDeSitemap(db: SupabaseClient, n: number): Promise<EntradaSitemap[]> {
  const entradas: EntradaSitemap[] = []
  const inicioBloque = n * FICHAS_POR_SITEMAP
  for (let desde = inicioBloque; desde < inicioBloque + FICHAS_POR_SITEMAP; desde += LOTE) {
    const hasta = Math.min(desde + LOTE, inicioBloque + FICHAS_POR_SITEMAP) - 1
    const { data, error } = await db.from('propiedades')
      .select(SELECT_FICHAS)
      .eq('estado', 'publicada')
      .order('id', { ascending: true })
      .range(desde, hasta)
    if (error) throw new Error('No se pudo generar el sitemap de fichas')
    for (const p of data ?? []) {
      const barrio = Array.isArray(p.barrios) ? p.barrios[0] : p.barrios
      if (barrio) entradas.push({ url: urlPublica(`/${barrio.slug}/${p.slug}`), lastModified: p.actualizado_en })
    }
    if (!data || data.length < hasta - desde + 1) break
  }
  return entradas
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
const escapar = (texto: string) => texto.replace(/[&<>"']/g, (c) => ESCAPES[c]!)

export function aXmlSitemap(entradas: readonly EntradaSitemap[]): string {
  const urls = entradas.map((e) =>
    `<url><loc>${escapar(e.url)}</loc>${e.lastModified ? `<lastmod>${escapar(new Date(e.lastModified).toISOString())}</lastmod>` : ''}</url>`,
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`
}
