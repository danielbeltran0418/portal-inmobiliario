import type { MetadataRoute } from 'next'
import { urlPublica } from '@/lib/catalogo/seo'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { numeroDeSitemapsDeFichas } from '@/lib/catalogo/sitemap'
export const dynamic = 'force-dynamic'

const PRIVADAS = [
  '/panel', '/mi-cuenta', '/control', '/imagen/', '/buscar', '/login', '/registro', '/recuperar',
  '/restablecer', '/confirmar', '/verificar-correo', '/api/', '/notificaciones/',
]

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Si no se puede contar, al menos el primero de fichas: nunca un robots.txt roto.
  let fichas = 1
  try {
    fichas = await numeroDeSitemapsDeFichas(crearClientePublico())
  } catch {
    fichas = 1
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: PRIVADAS },
    sitemap: [
      urlPublica('/sitemap.xml'),
      ...Array.from({ length: fichas }, (_, n) => urlPublica(`/sitemaps/fichas/${n}`)),
    ],
  }
}
