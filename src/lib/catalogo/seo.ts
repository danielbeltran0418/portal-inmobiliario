import type { Metadata } from 'next'
export type BarrioSeo = { nombre: string; slug: string }
export type FichaSeo = { titulo: string; slug: string; descripcion: string; precio: number; operacion: string; imagenes_propiedad: { id: string; orden: number; alt_text: string }[] }

export function urlPublica(ruta: string): string {
  const configurado = process.env.NEXT_PUBLIC_APP_URL
  if (!configurado) throw new Error('NEXT_PUBLIC_APP_URL es obligatoria para el catálogo')
  const base = new URL(configurado)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Origen público inválido')
  if (!ruta.startsWith('/') || ruta.startsWith('//') || ruta.includes('\\')) throw new Error('Ruta pública inválida')
  return new URL(ruta, base.origin).href
}
export function metadatosBarrio(barrio: BarrioSeo): Metadata {
  return {
    title: `Propiedades en ${barrio.nombre}, Barranquilla`,
    description: `Encuentra propiedades en venta y arriendo en ${barrio.nombre}, Barranquilla. Consulta precios, características y fotos.`,
    alternates: { canonical: urlPublica(`/${barrio.slug}`) },
  }
}
export function metadatosFicha(p: FichaSeo, barrio: BarrioSeo): Metadata {
  return {
    title: `${p.titulo} · ${barrio.nombre}, Barranquilla`,
    description: p.descripcion.trim().slice(0, 160) || `${p.titulo} en ${p.operacion} en ${barrio.nombre}, Barranquilla. Consulta precio y características.`,
    alternates: { canonical: urlPublica(`/${barrio.slug}/${p.slug}`) },
    robots: p.imagenes_propiedad.length === 0 ? { index: false, follow: true } : { index: true, follow: true },
  }
}
export function datosFicha(p: FichaSeo, barrio: BarrioSeo) {
  const url = urlPublica(`/${barrio.slug}/${p.slug}`)
  return {
    '@context': 'https://schema.org', '@type': 'RealEstateListing',
    name: p.titulo, description: p.descripcion, url,
    image: [...p.imagenes_propiedad].sort((a,b) => a.orden - b.orden).map(f => urlPublica(`/imagen/${f.id}`)),
    contentLocation: { '@type': 'Place', name: `${barrio.nombre}, Barranquilla`, address: { '@type': 'PostalAddress', addressLocality: 'Barranquilla', addressRegion: 'Atlántico', addressCountry: 'CO' } },
    offers: { '@type': 'Offer', price: p.precio, priceCurrency: 'COP', url, businessFunction: p.operacion === 'arriendo' ? 'http://purl.org/goodrelations/v1#LeaseOut' : 'http://purl.org/goodrelations/v1#Sell' },
  }
}
/** JSON válido que no permite introducir un cierre de etiqueta script. */
export function serializarJsonLd(datos: unknown): string {
  return JSON.stringify(datos).replace(/</g, String.fromCharCode(92) + 'u003c')
}
