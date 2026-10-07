import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { TarjetaPropiedad } from '@/components/tarjeta-propiedad'

const base = {
  id: 'p1',
  slug: 'casa-a123',
  titulo: 'Casa luminosa con patio',
  operacion: 'venta',
  tipo_inmueble: 'casa',
  precio: 420000000,
  habitaciones: 3,
  banos: 2,
  area_m2: 96,
  imagenes_propiedad: [{ id: 'f1', alt_text: 'Fachada', orden: 0 }],
}

const pintar = (cambios: Partial<typeof base> = {}) =>
  renderToStaticMarkup(createElement(TarjetaPropiedad, { propiedad: { ...base, ...cambios }, barrioSlug: 'el-prado' }))

describe('TarjetaPropiedad', () => {
  it('enlaza a la ficha del barrio', () => {
    expect(pintar()).toContain('href="/el-prado/casa-a123"')
  })

  it('como en el diseño de Figma Make: tipo y barrio, luego el titulo y despues el precio', () => {
    const html = renderToStaticMarkup(
      createElement(TarjetaPropiedad, { propiedad: base, barrioSlug: 'el-prado', barrioNombre: 'El Prado' }),
    )
    const eyebrow = html.indexOf('El Prado')
    const titulo = html.indexOf('Casa luminosa con patio')
    const precio = html.indexOf('420.000.000')
    expect(eyebrow).toBeGreaterThan(-1)
    expect(eyebrow).toBeLessThan(titulo)
    expect(titulo).toBeLessThan(precio)
  })

  it('sin nombre de barrio la cabecera de la tarjeta queda solo con el tipo', () => {
    const html = pintar()
    expect(html).toMatch(/>\s*casa\s*</i)
  })

  it('muestra habitaciones, banos y area cuando existen', () => {
    const html = pintar()
    expect(html).toContain('3 hab.')
    expect(html).toContain('2 baños')
    expect(html).toContain('96 m²')
  })

  it('omite lo que no tiene y conserva el cero (un estudio tiene 0 habitaciones)', () => {
    const html = pintar({ habitaciones: 0, banos: null as never, area_m2: null as never })
    expect(html).toContain('0 hab.')
    expect(html).not.toContain('baños')
    expect(html).not.toContain('m²')
  })

  it('sin ningun dato no pinta la fila de caracteristicas', () => {
    const html = pintar({ habitaciones: null as never, banos: null as never, area_m2: null as never })
    expect(html).not.toContain('hab.')
  })

  it('indica cuantas fotos hay solo si hay mas de una', () => {
    expect(pintar()).not.toContain('fotos')
    const dos = pintar({
      imagenes_propiedad: [
        { id: 'f1', alt_text: 'A', orden: 0 },
        { id: 'f2', alt_text: 'B', orden: 1 },
      ],
    })
    expect(dos).toContain('2 fotos')
  })

  it('sin fotos muestra el marcador y mantiene el titulo como h2', () => {
    const html = pintar({ imagenes_propiedad: [] })
    expect(html).toContain('Sin fotografías')
    expect(html).toMatch(/<h2[^>]*>[^<]*Casa luminosa con patio/)
  })

  it('distingue arriendo de venta por la etiqueta', () => {
    expect(pintar({ operacion: 'arriendo' })).toContain('arriendo')
  })
})
