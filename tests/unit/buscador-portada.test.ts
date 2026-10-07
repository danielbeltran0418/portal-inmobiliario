import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { BuscadorPortada } from '@/components/buscador-portada'

const ciudades = [
  { nombre: 'Bogotá', slug: 'bogota' },
  { nombre: 'Barranquilla', slug: 'barranquilla' },
]

describe('BuscadorPortada', () => {
  const html = renderToStaticMarkup(createElement(BuscadorPortada, { ciudades }))

  it('envia por GET al puente /buscar', () => {
    expect(html).toContain('action="/buscar"')
    expect(html).toContain('method="get"')
  })

  it('[alcance nacional] busca por ciudad, no por una lista de todos los barrios', () => {
    expect(html).toMatch(/<select[^>]*name="ciudad"/)
    expect(html).toContain('<option value="bogota">Bogotá</option>')
    expect(html).not.toContain('name="barrio"')
  })

  it('como en el diseño: operacion y ciudad en una fila, con etiquetas accesibles', () => {
    expect(html).toMatch(/<select[^>]*name="operacion"/)
    expect(html).toContain('value="venta"')
    expect(html).toContain('value="arriendo"')
    expect(html).toMatch(/<label[^>]*>[^<]*Operación/)
    expect(html).toMatch(/<label[^>]*>[^<]*Ciudad/)
    // Tipo y precio se filtran ya en el catalogo del barrio.
    expect(html).not.toContain('name="tipo"')
    expect(html).not.toContain('name="precio_max"')
  })

  it('tiene un campo de texto libre con etiqueta accesible', () => {
    expect(html).toMatch(/<input[^>]*name="q"/)
    expect(html).toMatch(/<label[^>]*>[^<]*Palabras clave/)
  })

  it('no se pinta sin ciudades: un formulario que no puede buscar nada confunde', () => {
    expect(renderToStaticMarkup(createElement(BuscadorPortada, { ciudades: [] }))).toBe('')
  })
})
