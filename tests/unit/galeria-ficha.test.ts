import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { GaleriaFicha } from '@/components/galeria-ficha'

const fotos = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `foto-${i + 1}`, alt_text: `Foto ${i + 1}`, orden: i }))

const pintar = (n: number) =>
  renderToStaticMarkup(createElement(GaleriaFicha, { fotos: fotos(n), titulo: 'Casa del Prado' }))

const imagenes = (html: string) => html.match(/<img[^>]*>/g) ?? []
const miniaturas = (html: string) => html.match(/<button[^>]*aria-label="Ver foto \d+"[^>]*>/g) ?? []

describe('GaleriaFicha (diseño de Figma Make: foto principal y miniaturas)', () => {
  it('sin fotos muestra un marcador honesto, sin imagenes', () => {
    const html = pintar(0)
    expect(html).toContain('Sin fotografías')
    expect(imagenes(html)).toHaveLength(0)
  })

  it('con una foto la muestra grande, sin miniaturas', () => {
    const html = pintar(1)
    expect(imagenes(html)).toHaveLength(1)
    expect(html).toContain('/imagen/foto-1')
    expect(miniaturas(html)).toHaveLength(0)
  })

  it('con varias: la principal es la primera y hay una miniatura por foto, la primera marcada', () => {
    const html = pintar(3)
    const botones = miniaturas(html)
    expect(botones).toHaveLength(3)
    expect(botones[0]).toContain('aria-pressed="true"')
    expect(botones[1]).toContain('aria-pressed="false"')
    // La principal va antes que las miniaturas y es la foto 1.
    expect(imagenes(html)[0]).toContain('/imagen/foto-1')
  })

  it('solo la foto principal se pide con prioridad: es la que pinta el LCP', () => {
    const html = pintar(3)
    const imgs = imagenes(html)
    expect(imgs.filter((t) => t.includes('fetchPriority="high"'))).toHaveLength(1)
    expect(imgs[0]).toContain('fetchPriority="high"')
    expect(imgs.slice(1).every((t) => t.includes('loading="lazy"'))).toBe(true)
  })

  it('ordena por orden aunque lleguen desordenadas', () => {
    const desordenadas = [
      { id: 'b', alt_text: 'B', orden: 1 },
      { id: 'a', alt_text: 'A', orden: 0 },
    ]
    const html = renderToStaticMarkup(createElement(GaleriaFicha, { fotos: desordenadas, titulo: 'T' }))
    expect(imagenes(html)[0]).toContain('/imagen/a')
  })

  it('usa el titulo como alt si la foto no tiene texto alternativo', () => {
    const html = renderToStaticMarkup(
      createElement(GaleriaFicha, { fotos: [{ id: 'x', alt_text: '', orden: 0 }], titulo: 'Casa del Prado' }),
    )
    expect(html).toContain('alt="Casa del Prado"')
  })
})
