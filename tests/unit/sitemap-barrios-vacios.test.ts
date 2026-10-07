import { expect, it, vi } from 'vitest'
const rango = vi.fn()
const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: rango }
for (const m of ['select', 'eq', 'order'] as const) q[m].mockReturnValue(q)
vi.mock('@/lib/supabase/cliente-publico', () => ({
  crearClientePublico: () => ({
    from: (tabla: string) => tabla === 'barrios'
      ? { select: () => ({ eq: () => ({ order: async () => ({ data: [{ slug: 'prado', ciudad_slug: 'barranquilla' }, { slug: 'vacio', ciudad_slug: 'medellin' }], error: null }) }) }) }
      : q,
  }),
}))
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
const { default: sitemap } = await import('@/app/sitemap')

it('no lista barrios sin ninguna propiedad publicada (paginas finas)', async () => {
  rango.mockReset().mockResolvedValueOnce({
    data: [{ id: '1', slug: 'casa-1', actualizado_en: '2026-09-09T00:00:00Z', barrios: { slug: 'prado' } }],
    error: null,
  })
  const urls = (await sitemap()).map((e) => e.url)
  expect(urls).toContain('https://portal.example/prado')
  expect(urls).toContain('https://portal.example/prado/casa-1')
  expect(urls).not.toContain('https://portal.example/vacio')
  expect(urls).toContain('https://portal.example/')
  // [ciudades] la ciudad con anuncios entra; la que solo tiene barrios vacios, no.
  expect(urls).toContain('https://portal.example/ciudad/barranquilla')
  expect(urls).not.toContain('https://portal.example/ciudad/medellin')
})
