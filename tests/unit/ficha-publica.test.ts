import { expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const resultado = vi.fn()
vi.mock('@/lib/supabase/cliente-publico', () => ({ crearClientePublico: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: resultado }) }) }) }) }) }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') }, permanentRedirect: (url: string) => { throw new Error(`REDIRECT:${url}`) } }))

// La ficha ahora tambien lee la sesion (sesionActual, que pasa por
// crearClienteServidor) y, con sesion, `leads` y `perfiles`. Un unico mock de
// crearClienteServidor sirve para las dos lecturas: sesionActual solo usa
// `auth`, y el bloque de la Task 7 solo usa `from`.
const getUser = vi.fn()
const getSession = vi.fn()
const leadPrevio = vi.fn()
const perfilTelefono = vi.fn()

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser, getSession },
    from: (tabla: string) => (
      tabla === 'leads'
        ? { select: () => ({ eq: () => ({ maybeSingle: leadPrevio }) }) }
        : { select: () => ({ maybeSingle: perfilTelefono }) }
    ),
  }),
}))

const { default: Ficha } = await import('@/app/[barrio]/[slug]/page')
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.example')
const params = Promise.resolve({ barrio: 'prado', slug: 'casa-a123' })

const PROPIEDAD = {
  id: 'prop-1',
  vendedor_id: 'vendedor-1',
  titulo: 'Casa del Prado',
  slug: 'casa-a123',
  descripcion: 'Casa luminosa',
  precio: 100000000,
  operacion: 'venta',
  barrios: { nombre: 'Prado', slug: 'prado' },
  imagenes_propiedad: [],
}

beforeEach(() => {
  getUser.mockReset()
  getSession.mockReset().mockResolvedValue({ data: { session: null } })
  leadPrevio.mockReset()
  perfilTelefono.mockReset()
})

it('no muestra una ficha invisible', async () => {
  resultado.mockResolvedValue({ data: null, error: null })
  await expect(Ficha({ params })).rejects.toThrow('NOT_FOUND')
})

it('renderiza la ficha publicada sin necesitar dirección exacta ni fotos', async () => {
  resultado.mockResolvedValue({ data: PROPIEDAD, error: null })
  getUser.mockResolvedValue({ data: { user: null } })

  const html = renderToStaticMarkup(await Ficha({ params }))

  expect(html).toContain('Casa del Prado')
  expect(html).toContain('Casa luminosa')
  expect(html).toContain('Prado')
})

it('sin sesion enseña un enlace al login con el volver de esta ficha, no el formulario', async () => {
  resultado.mockResolvedValue({ data: PROPIEDAD, error: null })
  getUser.mockResolvedValue({ data: { user: null } })

  const html = renderToStaticMarkup(await Ficha({ params }))

  expect(html).toContain('Entra o crea cuenta para contactar')
  expect(html).toContain(`/login?volver=${encodeURIComponent('/prado/casa-a123')}`)
  expect(html).not.toContain('Contactar al vendedor')
})

it('con sesion de comprador que no ha contactado antes, enseña el formulario precargado', async () => {
  resultado.mockResolvedValue({ data: PROPIEDAD, error: null })
  getUser.mockResolvedValue({ data: { user: { id: 'comprador-1' } } })
  leadPrevio.mockResolvedValue({ data: null, error: null })
  perfilTelefono.mockResolvedValue({ data: { telefono: '3000000000' }, error: null })

  const html = renderToStaticMarkup(await Ficha({ params }))

  expect(html).toContain('Contactar al vendedor')
  expect(html).toContain('3000000000')
  expect(html).not.toContain('Entra o crea cuenta')
  expect(html).not.toContain('Ya contactaste')
})

it('con un lead previo enseña "ya contactaste" y no el formulario', async () => {
  resultado.mockResolvedValue({ data: PROPIEDAD, error: null })
  getUser.mockResolvedValue({ data: { user: { id: 'comprador-1' } } })
  leadPrevio.mockResolvedValue({ data: { id: 'lead-1' }, error: null })
  perfilTelefono.mockResolvedValue({ data: null, error: null })

  const html = renderToStaticMarkup(await Ficha({ params }))

  expect(html).toContain('Ya contactaste sobre esta propiedad.')
  expect(html).not.toContain('Contactar al vendedor')
})

it('al vendedor de su propia propiedad no le ofrece el formulario ni el enlace', async () => {
  resultado.mockResolvedValue({ data: PROPIEDAD, error: null })
  getUser.mockResolvedValue({ data: { user: { id: PROPIEDAD.vendedor_id } } })
  leadPrevio.mockResolvedValue({ data: null, error: null })
  perfilTelefono.mockResolvedValue({ data: null, error: null })

  const html = renderToStaticMarkup(await Ficha({ params }))

  expect(html).not.toContain('Contactar al vendedor')
  expect(html).not.toContain('Ya contactaste')
  expect(html).not.toContain('Entra o crea cuenta')
})
