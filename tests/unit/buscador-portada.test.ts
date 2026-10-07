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

  it('ofrece venta y arriendo, tipo y precio maximo con etiquetas', () => {
    expect(html).toContain('name="operacion"')
    expect(html).toContain('value="venta"')
    expect(html).toContain('value="arriendo"')
    expect(html).toContain('name="tipo"')
    expect(html).toContain('name="precio_max"')
    expect(html).toContain('inputMode="numeric"')
    expect(html).toMatch(/<label[^>]*>[^<]*Barrio/)
  })

  it('no se pinta sin barrios: un formulario que no puede buscar nada confunde', () => {
    expect(renderToStaticMarkup(createElement(BuscadorPortada, { barrios: [] }))).toBe('')
  })
})
