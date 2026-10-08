import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { aXmlSitemap, fichasDeSitemap, numeroDeSitemapsDeFichas } from '@/lib/catalogo/sitemap'

export const dynamic = 'force-dynamic'

/**
 * /sitemaps/fichas/{n}: las fichas publicadas, de 40.000 en 40.000. robots.txt
 * enumera cuantos hay. Una hora de cache en la CDN: un anuncio nuevo tarda como
 * mucho eso en aparecer, y un rastreador no dispara 40 consultas por visita.
 */
export async function GET(_peticion: Request, contexto: { params: Promise<{ pagina: string }> }) {
  const { pagina } = await contexto.params
  if (!/^\d{1,4}$/.test(pagina)) return new Response(null, { status: 404 })
  const n = Number(pagina)
  const db = crearClientePublico()
  try {
    if (n >= (await numeroDeSitemapsDeFichas(db))) return new Response(null, { status: 404 })
    const xml = aXmlSitemap(await fichasDeSitemap(db, n))
    return new Response(xml, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=3600' },
    })
  } catch {
    // Mejor un 503 que un sitemap incompleto que el rastreador tome como verdad.
    return new Response(null, { status: 503, headers: { 'Retry-After': '600' } })
  }
}
