import type { MetadataRoute } from 'next'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { urlPublica } from '@/lib/catalogo/seo'
// La retirada de publicaciones debe reflejarse en cada petición del sitemap.
export const dynamic = 'force-dynamic'

/**
 * Sitemap principal: portada, ciudades y barrios con anuncios. Las fichas van
 * aparte en /sitemaps/fichas/{n} (src/app/sitemaps/fichas/[pagina]/route.ts),
 * de 40.000 en 40.000, y robots.txt los lista todos: a escala nacional no caben
 * en un solo archivo (tope del protocolo: 50.000 URLs).
 *
 * Un barrio sin propiedades publicadas es una pagina fina: no se lista. Lo
 * decide barrios_con_anuncios() (migracion 20261013000200) sin recorrer las
 * fichas.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data, error } = await crearClientePublico().rpc('barrios_con_anuncios')
  if (error) throw new Error('No se pudo generar el sitemap')
  const barrios = (data ?? []) as { slug: string; ciudad_slug: string | null }[]
  const ciudades = [...new Set(barrios.map((b) => b.ciudad_slug).filter((c): c is string => Boolean(c)))].sort()
  return [
    { url: urlPublica('/') },
    ...ciudades.map((c) => ({ url: urlPublica(`/ciudad/${c}`) })),
    ...barrios.map((b) => ({ url: urlPublica(`/${b.slug}`) })),
  ]
}
