import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const sesion = vi.fn()
const panel = vi.fn()
const recientes = vi.fn()
const ciudades = vi.fn()
const favoritos = vi.fn()

vi.mock('@/lib/auth/sesion', () => ({ sesionActual: () => sesion() }))
vi.mock('@/lib/navegacion/enlaces', () => ({ enlaceDePanel: (s: unknown) => panel(s) }))
vi.mock('@/lib/catalogo/consultas', () => ({ listarRecientes: () => recientes() }))
vi.mock('@/lib/comprador/favoritos', () => ({ idsFavoritos: (...a: unknown[]) => favoritos(...a) }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => ({}) }))
vi.mock('@/lib/comprador/acciones-favoritos', () => ({ conmutarFavoritoAction: vi.fn() }))
vi.mock('@/lib/catalogo/ciudades', () => ({ listarCiudades: () => ciudades() }))
vi.mock('@/lib/supabase/cliente-publico', () => ({ crearClientePublico: () => ({}) }))

const { default: PaginaInicio } = await import('@/app/page')

const PROPIEDAD = {
  id: 'p1', slug: 'casa-a123', titulo: 'Casa luminosa con patio', operacion: 'venta', tipo_inmueble: 'casa',
  precio: 420000000, habitaciones: 3, banos: 2, area_m2: 96,
  imagenes_propiedad: [{ id: 'f1', alt_text: 'Fachada', orden: 0 }],
  barrios: { slug: 'el-prado', nombre: 'El Prado' },
}

async function pintar() {
  return renderToStaticMarkup(await PaginaInicio())
}

beforeEach(() => {
  sesion.mockResolvedValue({ hayUsuario: false, accessToken: null, idUsuario: null })
  panel.mockReturnValue(null)
  favoritos.mockReset().mockResolvedValue(new Set())
  recientes.mockResolvedValue([PROPIEDAD])
  ciudades.mockResolvedValue([
    { nombre: 'Barranquilla', slug: 'barranquilla', barrios: 2 },
    { nombre: 'Bogotá', slug: 'bogota', barrios: 1 },
  ])
})

describe('portada (diseño de Figma Make)', () => {
  it('el titular es nacional: no ata el portal a una ciudad', async () => {
    const html = await pintar()
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ''
    expect(h1).toMatch(/hogar/i)
    expect(h1).not.toMatch(/Barranquilla|Arenosa/i)
    expect(html).toContain('Colombia')
  })

  it('el hero lleva la foto de portada sobre un fondo oscuro fijo', async () => {
    expect(await pintar()).toContain('url(/portada.jpg)')
  })

  it('el buscador va en el hero y envia al puente /buscar', async () => {
    expect(await pintar()).toContain('action="/buscar"')
  })

  it('[alcance nacional] cada ciudad enlaza a su catalogo y su nombre accesible es solo el de la ciudad', async () => {
    const html = await pintar()
    const enlaces = html.match(/<a [^>]*>/g) ?? []
    // El orden de los atributos lo decide next/link: se comprueban por separado.
    const enlace = (href: string) => enlaces.find((a) => a.includes(`href="${href}"`)) ?? ''
    expect(enlace('/ciudad/barranquilla')).toContain('aria-label="Barranquilla"')
    expect(enlace('/ciudad/bogota')).toContain('aria-label="Bogotá"')
    expect(html).toContain('Explora por ciudad')
  })

  it('muestra propiedades reales publicadas, enlazadas a su ficha', async () => {
    const html = await pintar()
    expect(html).toContain('Recién publicados')
    expect(html).toContain('href="/el-prado/casa-a123"')
  })

  it('sin propiedades publicadas no pinta esa seccion vacia', async () => {
    recientes.mockResolvedValue([])
    expect(await pintar()).not.toContain('Recién publicados')
  })

  it('al anonimo le ofrece crear cuenta de comprador o vendedor y entrar', async () => {
    const html = await pintar()
    expect(html).toMatch(/<a[^>]*href="\/registro"[^>]*>[^<]*Crear cuenta de vendedor/)
    expect(html).toMatch(/<a[^>]*href="\/registro"[^>]*>[^<]*Crear cuenta de comprador/)
    expect(html).toMatch(/<a[^>]*href="\/login"[^>]*>[^<]*Entrar/)
  })

  it('con sesion sustituye la invitacion por el acceso a su panel', async () => {
    sesion.mockResolvedValue({ hayUsuario: true, accessToken: 'x', idUsuario: 'u1' })
    panel.mockReturnValue({ etiqueta: 'Mi cuenta', destino: '/mi-cuenta' })
    const html = await pintar()
    expect(html).toMatch(/<a[^>]*href="\/mi-cuenta"[^>]*>[\s\S]*?Continuar a Mi cuenta/)
    expect(html).not.toContain('Crear cuenta de comprador')
    expect(html).not.toContain('Crear cuenta de vendedor')
  })

  it('sin barrios mantiene el aviso y no pinta un buscador inutil', async () => {
    ciudades.mockResolvedValue([])
    const html = await pintar()
    expect(html).toContain('Todavía no hay barrios disponibles')
    expect(html).not.toContain('action="/buscar"')
  })

  it('[diseño Figma Make] cada tarjeta lleva su corazon: al anonimo lo manda a entrar', async () => {
    const html = await pintar()
    expect(html).toContain('aria-label="Inicia sesión para guardar en favoritos"')
    expect(favoritos).not.toHaveBeenCalled()
  })

  it('con sesion el corazon refleja los favoritos del usuario', async () => {
    sesion.mockResolvedValue({ hayUsuario: true, accessToken: 'x', idUsuario: 'u1' })
    favoritos.mockResolvedValue(new Set(['p1']))
    const html = await pintar()
    expect(favoritos).toHaveBeenCalledWith(expect.anything(), 'u1', ['p1'])
    expect(html).toContain('aria-label="Eliminar de favoritos"')
  })
})
