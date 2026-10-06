import type { Metadata } from 'next'

export type BarrioSeo = { nombre: string; slug: string }
export type FichaSeo = {
  titulo: string
  slug: string
  descripcion: string
  precio: number
  operacion: string
  imagenes_propiedad: { id: string; orden: number; alt_text: string }[]
}

export function urlPublica(ruta: string): string {
  const configurado = process.env.NEXT_PUBLIC_APP_URL
  if (!configurado) throw new Error('NEXT_PUBLIC_APP_URL es obligatoria para el catálogo')
  const base = new URL(configurado)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new Error('Origen público inválido')
  }
  if (!ruta.startsWith('/') || ruta.startsWith('//') || ruta.includes('\\')) {
    throw new Error('Ruta pública inválida')
  }
  return new URL(ruta, base.origin).href
}

const NOMBRE_SITIO = 'Portal Inmobiliario'
const LOCALE_SITIO = 'es_CO'
const IMAGEN_FALLBACK = '/og-fallback.jpg'

/**
 * Descripcion para meta tags: colapsa espacios y saltos de linea y, si pasa de
 * 160 caracteres, corta en el limite de palabra y anade una elipsis.
 */
export function descripcionCorta(texto: string, maximo = 160): string {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  if (limpio.length <= maximo) return limpio
  const recorte = limpio.slice(0, maximo - 1)
  const ultimoEspacio = recorte.lastIndexOf(' ')
  return `${(ultimoEspacio > 0 ? recorte.slice(0, ultimoEspacio) : recorte).trimEnd()}…`
}

/**
 * Solo la primera pagina del catalogo de un barrio sin filtros merece indexarse:
 * cada combinacion de filtros o pagina es otra URL con contenido casi igual
 * (todas declaran la misma canonica) y multiplica lo que el rastreador visita.
 */
export function catalogoIndexable(filtros: {
  operacion?: string
  tipo?: string
  precioMin?: number
  precioMax?: number
  pagina: number
}): boolean {
  return (
    filtros.operacion === undefined &&
    filtros.tipo === undefined &&
    filtros.precioMin === undefined &&
    filtros.precioMax === undefined &&
    filtros.pagina <= 1
  )
}

export function metadatosBarrio(barrio: BarrioSeo, opciones: { indexable?: boolean } = {}): Metadata {
  const titulo = `Propiedades en ${barrio.nombre}, Barranquilla`
  const descripcion = `Encuentra propiedades en venta y arriendo en ${barrio.nombre}, Barranquilla. Consulta precios, características y fotos.`
  const url = urlPublica(`/${barrio.slug}`)
  const imagenUrl = urlPublica(IMAGEN_FALLBACK)
  const images = [{ url: imagenUrl, alt: `Propiedades en ${barrio.nombre}, Barranquilla` }]

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: url },
    ...(opciones.indexable === false ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: titulo,
      description: descripcion,
      url,
      siteName: NOMBRE_SITIO,
      locale: LOCALE_SITIO,
      type: 'website',
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: descripcion,
      images: [imagenUrl],
    },
  }
}

export function metadatosFicha(p: FichaSeo, barrio: BarrioSeo): Metadata {
  const titulo = `${p.titulo} · ${barrio.nombre}, Barranquilla`
  const descripcion =
    descripcionCorta(p.descripcion) ||
    `${p.titulo} en ${p.operacion} en ${barrio.nombre}, Barranquilla. Consulta precio y características.`
  const url = urlPublica(`/${barrio.slug}/${p.slug}`)

  const fotos = [...p.imagenes_propiedad].sort((a, b) => a.orden - b.orden)
  const primeraFoto = fotos[0]
  const imagenUrl = primeraFoto ? urlPublica(`/imagen/${primeraFoto.id}`) : urlPublica(IMAGEN_FALLBACK)
  const imagenAlt = primeraFoto?.alt_text || titulo
  const images = [{ url: imagenUrl, alt: imagenAlt }]

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: url },
    robots: p.imagenes_propiedad.length === 0 ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: titulo,
      description: descripcion,
      url,
      siteName: NOMBRE_SITIO,
      locale: LOCALE_SITIO,
      type: 'website',
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: descripcion,
      images: [imagenUrl],
    },
  }
}

/** BreadcrumbList de schema.org: la miga visible, para que los buscadores la usen. */
export function datosMigas(items: { nombre: string; ruta: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.nombre,
      item: urlPublica(item.ruta),
    })),
  }
}

export function datosFicha(p: FichaSeo, barrio: BarrioSeo) {
  const url = urlPublica(`/${barrio.slug}/${p.slug}`)
  // La miga va DENTRO del RealEstateListing (que es una WebPage y admite
  // `breadcrumb`) y no como un segundo script: la pagina emite un solo
  // ld+json y las pruebas E2E lo leen como tal.
  const migas = datosMigas([
    { nombre: 'Inicio', ruta: '/' },
    { nombre: barrio.nombre, ruta: `/${barrio.slug}` },
    { nombre: p.titulo, ruta: `/${barrio.slug}/${p.slug}` },
  ])
  const breadcrumb = { '@type': migas['@type'], itemListElement: migas.itemListElement }
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: p.titulo,
    description: p.descripcion,
    url,
    breadcrumb,
    image: [...p.imagenes_propiedad].sort((a, b) => a.orden - b.orden).map((f) => urlPublica(`/imagen/${f.id}`)),
    contentLocation: {
      '@type': 'Place',
      name: `${barrio.nombre}, Barranquilla`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Barranquilla',
        addressRegion: 'Atlántico',
        addressCountry: 'CO',
      },
    },
    offers: {
      '@type': 'Offer',
      price: p.precio,
      priceCurrency: 'COP',
      availability: 'https://schema.org/InStock',
      url,
      businessFunction:
        p.operacion === 'arriendo'
          ? 'http://purl.org/goodrelations/v1#LeaseOut'
          : 'http://purl.org/goodrelations/v1#Sell',
    },
  }
}

/** JSON válido que no permite introducir un cierre de etiqueta script. */
export function serializarJsonLd(datos: unknown): string {
  return JSON.stringify(datos).replace(/</g, String.fromCharCode(92) + 'u003c')
}
