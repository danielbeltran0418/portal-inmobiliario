import { afterEach, describe, expect, it, vi } from 'vitest'
import { datosFicha, datosMigas } from '@/lib/catalogo/seo'

vi.mock('next/font/google', () => ({
  Fraunces: () => ({ variable: 'fuente-titulo' }),
  Karla: () => ({ variable: 'fuente-texto' }),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const barrio = { nombre: 'El Prado', slug: 'el-prado' }
const ficha = {
  titulo: 'Casa luminosa',
  slug: 'casa-a123',
  descripcion: 'Una casa en El Prado',
  precio: 100000000,
  operacion: 'venta',
  imagenes_propiedad: [{ id: 'foto-1', alt_text: 'Fachada', orden: 0 }],
}

describe('datosMigas', () => {
  it('arma un BreadcrumbList con posiciones consecutivas y URLs absolutas', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
    const migas = datosMigas([
      { nombre: 'Inicio', ruta: '/' },
      { nombre: 'El Prado', ruta: '/el-prado' },
    ])
    expect(migas).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://portal.example/' },
        { '@type': 'ListItem', position: 2, name: 'El Prado', item: 'https://portal.example/el-prado' },
      ],
    })
  })
})

describe('datosFicha', () => {
  it('declara la miga de pan dentro del mismo objeto (la pagina emite un solo script ld+json)', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
    const datos = datosFicha(ficha, barrio)
    expect(datos['@type']).toBe('RealEstateListing')
    expect(datos.breadcrumb.itemListElement.map((i: { name: string }) => i.name)).toEqual([
      'Inicio', 'El Prado', 'Casa luminosa',
    ])
  })

  it('marca la oferta como disponible', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
    expect(datosFicha(ficha, barrio).offers.availability).toBe('https://schema.org/InStock')
  })
})

describe('metadataBase del layout raiz', () => {
  it('se deriva de NEXT_PUBLIC_APP_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
    const { metadata } = await import('../../src/app/layout')
    expect((metadata.metadataBase as URL).origin).toBe('https://portal.example')
  })

  it('no inventa un origen si la variable falta ni tumba el modulo', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    const { metadata } = await import('../../src/app/layout')
    expect(metadata.metadataBase).toBeUndefined()
  })
})
