import type { MetadataRoute } from 'next'
import { urlPublica } from '@/lib/catalogo/seo'
export const dynamic = 'force-dynamic'
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/panel', '/mi-cuenta', '/control', '/imagen/', '/login', '/registro', '/confirmar', '/verificar-correo'] },
    sitemap: urlPublica('/sitemap.xml'),
  }
}
