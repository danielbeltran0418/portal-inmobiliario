import { expect, it, vi } from 'vitest'
const rango = vi.fn()
const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: rango }
for (const m of ['select','eq','order'] as const) q[m].mockReturnValue(q)
vi.mock('@/lib/supabase/cliente-publico', () => ({ crearClientePublico: () => ({ from: (tabla: string) => tabla === 'barrios' ? { select: () => ({ eq: () => ({ order: async () => ({ data: [{ slug: 'prado' }], error: null }) }) }) } : q }) }))
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
const { default: sitemap } = await import('@/app/sitemap')
const { default: robots } = await import('@/app/robots')
it('pagina todas las fichas publicadas con barrio e imagen y devuelve fechas reales', async () => {
  rango.mockReset()
  rango.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => ({ id: String(i), slug: `casa-${i}`, actualizado_en: '2026-09-09T00:00:00Z', barrios: { slug: 'prado' } })), error: null })
    .mockResolvedValueOnce({ data: [{ id: '500', slug: 'ultima', actualizado_en: '2026-09-09T00:00:00Z', barrios: { slug: 'prado' } }], error: null })
  const entradas = await sitemap()
  expect(entradas.some(e => e.url === 'https://portal.example/prado/ultima')).toBe(true)
  expect(entradas.find(e => e.url.endsWith('/ultima'))?.lastModified).toBe('2026-09-09T00:00:00Z')
  expect(rango).toHaveBeenNthCalledWith(2, 500, 999)
  expect(q.eq).toHaveBeenCalledWith('estado', 'publicada')
  expect(q.select.mock.calls[0][0]).toContain('imagenes_propiedad!inner')
})
it('no entrega un sitemap incompleto si falla la consulta', async () => {
  rango.mockReset().mockResolvedValue({ data: null, error: { code: '503' } })
  await expect(sitemap()).rejects.toThrow()
})
it('robots excluye superficies privadas y apunta al sitemap configurado', () => {
  const r = robots()
  expect(r.sitemap).toBe('https://portal.example/sitemap.xml')
  expect(JSON.stringify(r.rules)).toContain('/panel')
  expect(JSON.stringify(r.rules)).toContain('/imagen/')
})
