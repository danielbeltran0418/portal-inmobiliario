import { afterEach, expect, it, vi } from 'vitest'
import { urlPublica, metadatosBarrio, metadatosFicha, datosFicha, serializarJsonLd } from '@/lib/catalogo/seo'

afterEach(() => vi.unstubAllEnvs())

const barrio = { nombre: 'El Prado', slug: 'el-prado' }
const ficha = {
  titulo: 'Casa luminosa',
  slug: 'casa-a123',
  descripcion: 'Una casa en El Prado',
  precio: 100000000,
  operacion: 'venta',
  imagenes_propiedad: [{ id: 'foto-1', alt_text: 'Fachada', orden: 0 }],
}

it('construye URLs sobre el origen configurado, sin usar cabeceras Host', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
  expect(urlPublica('/el-prado')).toBe('https://portal.example/el-prado')
  expect(() => urlPublica('//otro.example')).toThrow()
})

it('no inventa un dominio si falta configuracion', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
  expect(() => urlPublica('/')).toThrow()
})

it('define titulos propios y canonicas de barrio y ficha', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
  expect(metadatosBarrio(barrio).alternates?.canonical).toBe('https://portal.example/el-prado')
  expect(metadatosBarrio(barrio).title).toContain('El Prado')
  expect(metadatosFicha(ficha, barrio).alternates?.canonical).toBe('https://portal.example/el-prado/casa-a123')
  expect(metadatosFicha(ficha, barrio).title).toContain('Casa luminosa')
})

it('genera etiquetas Open Graph y Twitter Card para ficha con imagen de propiedad y sin direccion exacta', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
  const fichaConPrivados = {
    ...ficha,
    direccion: 'Calle 84 #51B-32 apto 501',
    latitud: 10.9987,
    longitud: -74.7981,
  }

  const meta = metadatosFicha(fichaConPrivados as typeof ficha, barrio)
  const og = meta.openGraph as Record<string, unknown> | undefined
  const twitter = meta.twitter as Record<string, unknown> | undefined

  // Open Graph
  expect(og).toBeDefined()
  expect(og?.title).toContain('Casa luminosa')
  expect(og?.url).toBe('https://portal.example/el-prado/casa-a123')
  expect(og?.locale).toBe('es_CO')
  expect(og?.type).toBe('website')
  expect(og?.siteName).toBe('Portal Inmobiliario')
  expect(og?.images).toEqual([
    {
      url: 'https://portal.example/imagen/foto-1',
      alt: 'Fachada',
    },
  ])

  // Twitter Card
  expect(twitter).toBeDefined()
  expect(twitter?.card).toBe('summary_large_image')
  expect(twitter?.title).toContain('Casa luminosa')
  expect(twitter?.images).toEqual(['https://portal.example/imagen/foto-1'])

  // Verificacion estricta de privacidad: la direccion exacta o coordenadas nunca aparecen en metadata
  const stringified = JSON.stringify(meta)
  expect(stringified).not.toMatch(/Calle 84|51B-32|501|latitud|longitud|10.9987|-74.7981/)
})

it('usa fallback estatico cuando la propiedad no tiene fotos', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
  const sinFotos = { ...ficha, imagenes_propiedad: [] }
  const meta = metadatosFicha(sinFotos, barrio)
  const og = meta.openGraph as Record<string, unknown> | undefined
  const twitter = meta.twitter as Record<string, unknown> | undefined

  expect(og?.images).toEqual([
    {
      url: 'https://portal.example/og-fallback.jpg',
      alt: expect.stringContaining('Casa luminosa'),
    },
  ])
  expect(twitter?.images).toEqual(['https://portal.example/og-fallback.jpg'])
})

it('genera etiquetas Open Graph y Twitter Card para pagina de barrio con fallback', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
  const meta = metadatosBarrio(barrio)
  const og = meta.openGraph as Record<string, unknown> | undefined
  const twitter = meta.twitter as Record<string, unknown> | undefined

  expect(og?.siteName).toBe('Portal Inmobiliario')
  expect(og?.locale).toBe('es_CO')
  expect(og?.type).toBe('website')
  expect(og?.url).toBe('https://portal.example/el-prado')
  expect(og?.images).toEqual([
    {
      url: 'https://portal.example/og-fallback.jpg',
      alt: expect.stringContaining('El Prado'),
    },
  ])
  expect(twitter?.card).toBe('summary_large_image')
  expect(twitter?.images).toEqual(['https://portal.example/og-fallback.jpg'])
})

it('los datos estructurados solo publican ubicacion por barrio y fotos estables', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
  const datos = datosFicha({ ...ficha, direccion: 'SECRETO' } as typeof ficha, barrio)
  expect(datos['@type']).toBe('RealEstateListing')
  expect(datos.offers.price).toBe(100000000)
  expect(datos.image).toEqual(['https://portal.example/imagen/foto-1'])
  expect(JSON.stringify(datos)).not.toMatch(/SECRETO|streetAddress|latitude|longitude/)
})

it('impide cerrar el script desde un titulo o descripcion', () => {
  const peligroso = { name: '</script><script>alert(1)</script>' }
  const texto = serializarJsonLd(peligroso)
  expect(texto).not.toContain('<')
  expect(JSON.parse(texto)).toEqual(peligroso)
})
