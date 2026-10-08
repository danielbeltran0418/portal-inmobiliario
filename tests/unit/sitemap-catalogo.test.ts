import { describe, expect, it, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const rango = vi.fn()
const contar = vi.fn()
const q: Record<string, ReturnType<typeof vi.fn>> = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: rango }
q.select.mockImplementation((_c: string, opciones?: { head?: boolean }) => (opciones?.head ? { eq: () => contar() } : q))
q.eq.mockReturnValue(q)
q.order.mockReturnValue(q)
vi.mock('@/lib/supabase/cliente-publico', () => ({ crearClientePublico: () => ({ rpc, from: () => q }) }))
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')

const { default: sitemap } = await import('@/app/sitemap')
const { default: robots } = await import('@/app/robots')
const { GET } = await import('@/app/sitemaps/fichas/[pagina]/route')
const { FICHAS_POR_SITEMAP, aXmlSitemap } = await import('@/lib/catalogo/sitemap')

const pedir = (pagina: string) => GET(new Request(`http://localhost/sitemaps/fichas/${pagina}`), { params: Promise.resolve({ pagina }) })

beforeEach(() => {
  rpc.mockReset()
  rango.mockReset()
  contar.mockReset().mockResolvedValue({ count: 3, error: null })
})

describe('/sitemap.xml', () => {
  it('portada, ciudades y barrios con anuncios, sin recorrer las fichas', async () => {
    rpc.mockResolvedValue({ data: [{ slug: 'prado', ciudad_slug: 'barranquilla' }, { slug: 'chapinero', ciudad_slug: 'bogota' }], error: null })
    const urls = (await sitemap()).map((e) => e.url)
    expect(rpc).toHaveBeenCalledWith('barrios_con_anuncios')
    expect(urls).toEqual([
      'https://portal.example/',
      'https://portal.example/ciudad/barranquilla',
      'https://portal.example/ciudad/bogota',
      'https://portal.example/prado',
      'https://portal.example/chapinero',
    ])
    expect(rango).not.toHaveBeenCalled()
  })

  it('no entrega un sitemap incompleto si falla la consulta', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '503' } })
    await expect(sitemap()).rejects.toThrow()
  })
})

describe('/sitemaps/fichas/{n}', () => {
  it('pagina por lotes de 1000 dentro de su bloque y devuelve XML con fechas reales', async () => {
    rango.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => ({ id: String(i), slug: `casa-${i}`, actualizado_en: '2026-09-09T00:00:00Z', barrios: { slug: 'prado' } })), error: null })
      .mockResolvedValueOnce({ data: [{ id: '1000', slug: 'ultima', actualizado_en: '2026-09-09T00:00:00Z', barrios: { slug: 'prado' } }], error: null })
    const r = await pedir('0')
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toMatch(/xml/)
    const xml = await r.text()
    expect(xml).toContain('<loc>https://portal.example/prado/ultima</loc><lastmod>2026-09-09T00:00:00.000Z</lastmod>')
    expect(rango).toHaveBeenNthCalledWith(1, 0, 999)
    expect(rango).toHaveBeenNthCalledWith(2, 1000, 1999)
    expect(q.select.mock.calls.some(([c]) => String(c).includes('imagenes_propiedad!inner'))).toBe(true)
  })

  it('el bloque n empieza en n * FICHAS_POR_SITEMAP', async () => {
    contar.mockResolvedValue({ count: FICHAS_POR_SITEMAP + 5, error: null })
    rango.mockResolvedValue({ data: [], error: null })
    expect((await pedir('1')).status).toBe(200)
    expect(rango).toHaveBeenCalledWith(FICHAS_POR_SITEMAP, FICHAS_POR_SITEMAP + 999)
  })

  it('un numero fuera de rango o no numerico es 404', async () => {
    expect((await pedir('1')).status).toBe(404)
    expect((await pedir('abc')).status).toBe(404)
  })

  it('un fallo de la base es 503, no un sitemap a medias', async () => {
    rango.mockResolvedValue({ data: null, error: { message: 'x' } })
    expect((await pedir('0')).status).toBe(503)
  })

  it('escapa los caracteres especiales del XML', () => {
    expect(aXmlSitemap([{ url: 'https://p.example/a?b=1&c=<2>' }])).toContain('<loc>https://p.example/a?b=1&amp;c=&lt;2&gt;</loc>')
  })
})

describe('robots.txt', () => {
  it('excluye superficies privadas y lista el sitemap principal y todos los de fichas', async () => {
    contar.mockResolvedValue({ count: FICHAS_POR_SITEMAP * 2 + 1, error: null })
    const r = await robots()
    expect(r.sitemap).toEqual([
      'https://portal.example/sitemap.xml',
      'https://portal.example/sitemaps/fichas/0',
      'https://portal.example/sitemaps/fichas/1',
      'https://portal.example/sitemaps/fichas/2',
    ])
    const reglas = JSON.stringify(r.rules)
    for (const privada of ['/panel', '/imagen/', '/recuperar', '/restablecer', '/api/']) expect(reglas).toContain(privada)
  })

  it('si no se puede contar, igual responde con el primer sitemap de fichas', async () => {
    contar.mockResolvedValue({ count: null, error: { message: 'x' } })
    expect((await robots()).sitemap).toEqual(['https://portal.example/sitemap.xml', 'https://portal.example/sitemaps/fichas/0'])
  })
})
