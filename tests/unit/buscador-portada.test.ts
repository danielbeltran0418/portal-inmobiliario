import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { BuscadorPortada } from '@/components/buscador-portada'

const barrios = [
  { nombre: 'El Prado', slug: 'el-prado' },
  { nombre: 'Riomar', slug: 'riomar' },
]

describe('BuscadorPortada', () => {
  const html = renderToStaticMarkup(createElement(BuscadorPortada, { barrios }))

  it('envia por GET al puente /buscar', () => {
    expect(html).toContain('action="/buscar"')
    expect(html).toContain('method="get"')
  })

  it('lista cada barrio con su slug como valor', () => {
    expect(html).toContain('<option value="el-prado">El Prado</option>')
    expect(html).toContain('<option value="riomar">Riomar</option>')
  })

  it('como en el diseño: operacion y barrio en una fila, con etiquetas accesibles', () => {
    expect(html).toMatch(/<select[^>]*name="operacion"/)
    expect(html).toContain('value="venta"')
    expect(html).toContain('value="arriendo"')
    expect(html).toMatch(/<label[^>]*>[^<]*Operación/)
    expect(html).toMatch(/<label[^>]*>[^<]*Barrio/)
    // Tipo y precio se filtran ya en el catalogo del barrio.
    expect(html).not.toContain('name="tipo"')
    expect(html).not.toContain('name="precio_max"')
  })

  it('tiene un campo de texto libre con etiqueta accesible', () => {
    expect(html).toMatch(/<input[^>]*name="q"/)
    expect(html).toMatch(/<label[^>]*>[^<]*Palabras clave/)
  })

  it('no se pinta sin barrios: un formulario que no puede buscar nada confunde', () => {
    expect(renderToStaticMarkup(createElement(BuscadorPortada, { barrios: [] }))).toBe('')
  })
})
