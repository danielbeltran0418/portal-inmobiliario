import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const { default: NoEncontrado } = await import('@/app/not-found')
const { default: ErrorDeRuta } = await import('@/app/error')
const { default: ErrorGlobal } = await import('@/app/global-error')

describe('páginas de error en español', () => {
  it('404: dice en español que no existe y ofrece volver al inicio', () => {
    const html = renderToStaticMarkup(createElement(NoEncontrado))
    expect(html).toMatch(/<h1[^>]*>[^<]*no existe/i)
    expect(html).toContain('href="/"')
    expect(html).not.toMatch(/could not be found|not found/i)
  })

  it('error de una ruta: mensaje propio, sin el detalle interno, y botón para reintentar', () => {
    const error = Object.assign(new Error('relation "secreta" does not exist'), { digest: 'abc123' })
    const html = renderToStaticMarkup(createElement(ErrorDeRuta, { error, retry: vi.fn() }))
    expect(html).toMatch(/<h1[^>]*>[^<]*Algo salió mal/)
    expect(html).toMatch(/<button[^>]*>[^<]*Intentar de nuevo/)
    expect(html).not.toContain('secreta')
    // El digest sí: es lo que permite encontrar el error en los logs del servidor.
    expect(html).toContain('abc123')
  })

  it('error global: trae su propio documento en español', () => {
    const html = renderToStaticMarkup(createElement(ErrorGlobal, { error: new Error('x'), retry: vi.fn() }))
    expect(html).toMatch(/^<html[^>]*lang="es"/)
    expect(html).toContain('<body')
    expect(html).toContain('Intentar de nuevo')
  })
})
