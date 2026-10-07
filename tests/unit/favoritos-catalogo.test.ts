import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/comprador/acciones-favoritos', () => ({ conmutarFavoritoAction: vi.fn() }))

const { idsFavoritos } = await import('@/lib/comprador/favoritos')
const { CorazonTarjeta } = await import('@/components/comprador/corazon-tarjeta')

function cliente(resultado: { data: unknown; error: unknown }) {
  const q = { select: vi.fn(), eq: vi.fn(), in: vi.fn().mockResolvedValue(resultado) }
  q.select.mockReturnValue(q)
  q.eq.mockReturnValue(q)
  const from = vi.fn(() => q)
  return { db: { from } as unknown as SupabaseClient, from, q }
}

describe('idsFavoritos', () => {
  it('consulta solo las propiedades listadas del usuario y devuelve un conjunto', async () => {
    const { db, q } = cliente({ data: [{ propiedad_id: 'a' }, { propiedad_id: 'c' }], error: null })
    const ids = await idsFavoritos(db, 'u1', ['a', 'b', 'c'])
    expect(q.eq).toHaveBeenCalledWith('usuario_id', 'u1')
    expect(q.in).toHaveBeenCalledWith('propiedad_id', ['a', 'b', 'c'])
    expect([...ids].sort()).toEqual(['a', 'c'])
  })

  it('sin propiedades no consulta nada', async () => {
    const { db, from } = cliente({ data: [], error: null })
    expect((await idsFavoritos(db, 'u1', [])).size).toBe(0)
    expect(from).not.toHaveBeenCalled()
  })

  it('un fallo de la base pinta los corazones vacios en vez de romper el catalogo', async () => {
    const { db } = cliente({ data: null, error: new Error('caida') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await idsFavoritos(db, 'u1', ['a'])).size).toBe(0)
  })
})

describe('CorazonTarjeta', () => {
  it('sin sesion es un enlace al login que vuelve al catalogo', () => {
    const html = renderToStaticMarkup(
      createElement(CorazonTarjeta, { propiedadId: 'p1', conSesion: false, favorito: false, volver: '/el-prado?tipo=casa' }),
    )
    expect(html).toContain('href="/login?volver=%2Fel-prado%3Ftipo%3Dcasa"')
    expect(html).toContain('aria-label="Inicia sesión para guardar en favoritos"')
    expect(html).not.toContain('<button')
  })

  it('con sesion es el boton de favorito con su estado', () => {
    const html = renderToStaticMarkup(
      createElement(CorazonTarjeta, { propiedadId: 'p1', conSesion: true, favorito: true, volver: '/el-prado' }),
    )
    expect(html).toContain('<button')
    expect(html).toContain('aria-label="Eliminar de favoritos"')
    expect(html).toContain('aria-pressed="true"')
  })
})
