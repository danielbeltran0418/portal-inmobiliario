import type { MetadataRoute } from 'next'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'
import { urlPublica } from '@/lib/catalogo/seo'
// La retirada de publicaciones debe reflejarse en cada petición del sitemap.
export const dynamic = 'force-dynamic'
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = crearClientePublico()
  const { data: barrios, error: errorBarrios } = await db.from('barrios').select('slug').eq('activo', true).order('slug')
  if (errorBarrios) throw new Error('No se pudo generar el sitemap')
  const entradas: MetadataRoute.Sitemap = [
    { url: urlPublica('/') }, { url: urlPublica('/catalogo') },
    ...(barrios ?? []).map(b => ({ url: urlPublica(`/${b.slug}`) })),
  ]
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await db.from('propiedades')
      .select('id,slug,actualizado_en,barrios!inner(slug),imagenes_propiedad!inner(id)')
      .eq('estado', 'publicada').order('id', { ascending: true }).range(inicio, inicio + 499)
    if (error) throw new Error('No se pudo generar el sitemap')
    for (const p of data ?? []) {
      const barrio = Array.isArray(p.barrios) ? p.barrios[0] : p.barrios
      if (barrio) entradas.push({ url: urlPublica(`/${barrio.slug}/${p.slug}`), lastModified: p.actualizado_en })
    }
    // No emitir silenciosamente un XML inválido por superar el límite del protocolo.
    if (entradas.length > 50000) throw new Error('El sitemap requiere partición en varios archivos')
    if (!data || data.length < 500) return entradas
  }
}
