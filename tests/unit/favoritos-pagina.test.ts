import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
const sesion = vi.fn()
const favoritos = vi.fn()
vi.mock('@/lib/auth/sesion', () => ({ sesionActual: () => sesion() }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => ({}) }))
vi.mock('next/navigation', () => ({ redirect: (r: string) => { throw new Error(`REDIRECT:${r}`) } }))
vi.mock('@/lib/comprador/favoritos', async (original) => ({
  ...(await original<typeof import('@/lib/comprador/favoritos')>()),
  obtenerFavoritosUsuario: () => favoritos(),
}))
vi.mock('@/lib/comprador/acciones-favoritos', () => ({ conmutarFavoritoAction: vi.fn() }))

const { default: PaginaFavoritos } = await import('@/app/(comprador)/mi-cuenta/favoritos/page')
const { TarjetaPropiedad } = await import('@/components/tarjeta-propiedad')

const FAVORITO = {
  id: 'fav-1',
  propiedad_id: 'p1',
  creado_en: '2026-10-01T00:00:00Z',
  propiedad: {
    id: 'p1', slug: 'casa-a123', titulo: 'Casa en Ciudad Jardín', precio: 420000000, moneda: 'COP',
    operacion: 'venta', tipo_inmueble: 'casa', habitaciones: 3, banos: 2, area_m2: 96,
    barrio: { nombre: 'Ciudad Jardín', slug: 'ciudad-jardin' },
    imagenes_propiedad: [{ id: 'img-2', alt_text: 'Patio', orden: 1 }, { id: 'img-1', alt_text: 'Fachada', orden: 0 }],
  },
}

beforeEach(() => {
  sesion.mockResolvedValue({ hayUsuario: true, accessToken: 'x', idUsuario: 'u1' })
  favoritos.mockResolvedValue([FAVORITO])
})

describe('favoritos (diseño de Figma Make y enlaces correctos)', () => {
  it('enlaza a la ficha con el slug del barrio, no con su nombre (con tildes y espacios rompia)', async () => {
    const html = renderToStaticMarkup(await PaginaFavoritos())
    expect(html).toContain('href="/ciudad-jardin/casa-a123"')
    expect(html).not.toContain('ciudad-jardín')
  })

  it('pide la portada por el id de la imagen y en el orden de la galeria', async () => {
    const html = renderToStaticMarkup(await PaginaFavoritos())
    expect(html).toContain('/imagen/img-1')
  })

  it('mantiene el encabezado y el boton para quitar el favorito', async () => {
    const html = renderToStaticMarkup(await PaginaFavoritos())
    expect(html).toMatch(/<h2[^>]*>Propiedades Favoritas<\/h2>/)
    expect(html).toMatch(/aria-label="[^"]*favoritos[^"]*"/i)
  })

  it('no fija la ciudad: el portal es nacional', async () => {
    expect(renderToStaticMarkup(await PaginaFavoritos())).not.toContain('Barranquilla')
  })
})

describe('TarjetaPropiedad con una accion encima', () => {
  it('pinta la accion fuera del enlace: un boton dentro de un <a> no es valido', () => {
    const html = renderToStaticMarkup(
      createElement(TarjetaPropiedad, {
        propiedad: { ...FAVORITO.propiedad, imagenes_propiedad: FAVORITO.propiedad.imagenes_propiedad },
        barrioSlug: 'ciudad-jardin',
        accion: createElement('button', { type: 'button' }, 'quitar'),
      }),
    )
    const enlace = html.match(/<a [\s\S]*?<\/a>/)?.[0] ?? ''
    expect(html).toContain('quitar')
    expect(enlace).not.toContain('quitar')
  })
})

describe('obtenerFavoritosUsuario', () => {
  it('pide el slug del barrio y el id, alt y orden de las imagenes', async () => {
    const { obtenerFavoritosUsuario } = await vi.importActual<typeof import('@/lib/comprador/favoritos')>('@/lib/comprador/favoritos')
    const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }
    q.select.mockReturnValue(q)
    q.eq.mockReturnValue(q)
    q.order.mockResolvedValue({ data: [], error: null })
    await obtenerFavoritosUsuario({ from: () => q } as unknown as SupabaseClient, 'u1')
    const columnas = (q.select.mock.calls[0][0] as string).replace(/\s+/g, '')
    expect(columnas).toContain('barrio:barrios(nombre,slug)')
    expect(columnas).toContain('imagenes_propiedad(id,alt_text,orden)')
  })
})
