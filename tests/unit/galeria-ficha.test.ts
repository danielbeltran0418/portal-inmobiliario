import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { GaleriaFicha } from '@/components/galeria-ficha'

const fotos = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `foto-${i + 1}`, alt_text: `Foto ${i + 1}`, orden: i }))

const pintar = (n: number) =>
  renderToStaticMarkup(createElement(GaleriaFicha, { fotos: fotos(n), titulo: 'Casa del Prado' }))

describe('GaleriaFicha', () => {
  it('sin fotos muestra un marcador honesto, sin imagenes', () => {
    const html = pintar(0)
    expect(html).toContain('Sin fotografías')
    expect(html).not.toContain('<img')
  })

  it('con una foto la muestra grande y sin desplegable', () => {
    const html = pintar(1)
    expect(html.match(/<img/g)).toHaveLength(1)
    expect(html).toContain('/imagen/foto-1')
    expect(html).not.toContain('<details')
  })

  it('hasta cinco fotos van todas visibles, la primera como destacada', () => {
    const html = pintar(5)
    expect(html.match(/<img/g)).toHaveLength(5)
    expect(html).not.toContain('<details')
    expect(html.indexOf('/imagen/foto-1')).toBeLessThan(html.indexOf('/imagen/foto-2'))
  })

  it('mas de cinco: las cinco primeras visibles y el resto tras un desplegable con el total', () => {
    const html = pintar(8)
    const [visibles, resto] = html.split('<details')
    expect(visibles.match(/<img/g)).toHaveLength(5)
    expect(resto.match(/<img/g)).toHaveLength(3)
    expect(resto).toContain('Ver las 8 fotos')
  })

  it('ordena por orden aunque lleguen desordenadas', () => {
    const desordenadas = [
      { id: 'b', alt_text: 'B', orden: 1 },
      { id: 'a', alt_text: 'A', orden: 0 },
    ]
    const html = renderToStaticMarkup(createElement(GaleriaFicha, { fotos: desordenadas, titulo: 'T' }))
    expect(html.indexOf('/imagen/a')).toBeLessThan(html.indexOf('/imagen/b'))
  })

  it('usa el titulo como alt si la foto no tiene texto alternativo', () => {
    const html = renderToStaticMarkup(
      createElement(GaleriaFicha, { fotos: [{ id: 'x', alt_text: '', orden: 0 }], titulo: 'Casa del Prado' }),
    )
    expect(html).toContain('alt="Casa del Prado"')
  })

  it('solo la primera foto se precarga: es la que pinta el LCP', () => {
    const html = pintar(3)
    // Next anade ademas un <link rel="preload"> para la imagen con prioridad:
    // por eso se cuentan las etiquetas <img>, no la aparicion del atributo.
    const imagenes = html.match(/<img[^>]*>/g) ?? []
    expect(imagenes.filter((t) => t.includes('fetchPriority="high"'))).toHaveLength(1)
    expect(imagenes[0]).toContain('fetchPriority="high"')
    expect(imagenes[0]).toContain('loading="eager"')
    expect(imagenes.slice(1).every((t) => t.includes('loading="lazy"'))).toBe(true)
  })
})
