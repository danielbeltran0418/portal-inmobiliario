import { expect, it, vi } from 'vitest'
const firma = vi.fn()
const consulta = vi.fn()
vi.mock('@/lib/supabase/cliente-publico', () => ({ crearClientePublico: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: consulta }) }) }) }) }))
vi.mock('@/lib/supabase/cliente-admin', () => ({ crearClienteAdmin: () => ({ storage: { from: () => ({ createSignedUrl: firma }) } }) }))
const { GET } = await import('@/app/imagen/[id]/route')
const contexto = { params: Promise.resolve({ id: '12345678-1234-4234-8234-123456789abc' }) }
it('no firma una imagen invisible para anon', async () => {
  firma.mockClear()
  consulta.mockResolvedValue({ data: null, error: null })
  expect((await GET(new Request('http://localhost/imagen/id'), contexto)).status).toBe(404)
  expect(firma).not.toHaveBeenCalled()
})
it('firma solo la ruta de una propiedad publicada y deja cachear el salto MENOS que la firma', async () => {
  consulta.mockResolvedValue({ data: { ruta_storage: 'dueno/casa/foto.webp', propiedades: { estado: 'publicada' } }, error: null })
  firma.mockResolvedValue({ data: { signedUrl: 'https://proyecto.supabase.co/firma' }, error: null })
  const respuesta = await GET(new Request('http://localhost/imagen/id'), contexto)
  expect(respuesta.status).toBe(307)
  const [, segundosFirma] = firma.mock.calls.at(-1)! as [string, number]
  expect(firma).toHaveBeenCalledWith('dueno/casa/foto.webp', segundosFirma)
  const cache = respuesta.headers.get('cache-control')!
  const maxAge = Number(/max-age=(\d+)/.exec(cache)![1])
  const sMaxAge = Number(/s-maxage=(\d+)/.exec(cache)![1])
  // Una redireccion cacheada nunca puede apuntar a una firma ya caducada.
  expect(cache).toMatch(/^public/)
  expect(Math.max(maxAge, sMaxAge)).toBeLessThan(segundosFirma)
  expect(maxAge).toBeGreaterThan(0)
})

it('los errores no se cachean', async () => {
  consulta.mockResolvedValue({ data: null, error: { message: 'caida' } })
  const respuesta = await GET(new Request('http://localhost/imagen/id'), contexto)
  expect(respuesta.status).toBe(503)
  expect(respuesta.headers.get('cache-control')).toBe('no-store')
})
it('falla cerrado incluso si una fila no publicada llega desde la consulta', async () => {
  firma.mockClear()
  consulta.mockResolvedValue({ data: { ruta_storage: 'privada', propiedades: { estado: 'borrador' } }, error: null })
  expect((await GET(new Request('http://localhost/imagen/id'), contexto)).status).toBe(404)
  expect(firma).not.toHaveBeenCalled()
})
