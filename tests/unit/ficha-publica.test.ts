import { expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const resultado = vi.fn()
vi.mock('@/lib/supabase/cliente-publico', () => ({ crearClientePublico: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: resultado }) }) }) }) }) }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') }, permanentRedirect: (url: string) => { throw new Error(`REDIRECT:${url}`) } }))

// La ficha ahora tambien lee la sesion (sesionActual, que pasa por
// crearClienteServidor) y, con sesion, `leads` y `perfiles`. Un unico mock de
// crearClienteServidor sirve para las dos lecturas: sesionActual solo usa
// `auth`, y el bloque de la Task 7 solo usa `from`.
//
// `eqLeads`/`eqPerfil` son espias, no solo pasarelas: `leads` tiene DOS
// politicas permisivas de SELECT que RLS combina con OR
// (leads_lectura_comprador Y leads_lectura_vendedor,
// supabase/migrations/20260911000300_leads.sql) y `perfiles` tiene una de
// super_admin que tampoco restringe por id (perfil_lectura_super_admin), asi
// que el filtro por comprador_id/id en el codigo es OBLIGATORIO, no
// redundante -- mismo patron que ya mordio en la Task 11 de SP0. Un mock que
// solo devolviera datos fijos sin importar los argumentos de `.eq()` no
// detectaria que ese filtro desaparecio (los datos de prueba no cambian: en
// unit test no hay RLS de verdad). Por eso las pruebas de mas abajo aseveran
// tambien CON QUE se llamo a `.eq()`, no solo el HTML resultante.
const getUser = vi.fn()
const getSession = vi.fn()
const eqLeads = vi.fn()
const leadPrevio = vi.fn()
const eqPerfil = vi.fn()
const perfilTelefono = vi.fn()

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser, getSession },
    from: (tabla: string) => {
      if (tabla === 'leads') {
        const cadena = { eq: eqLeads, maybeSingle: leadPrevio }
        eqLeads.mockReturnValue(cadena)
        return { select: () => cadena }
      }
      const cadenaPerfil = { eq: eqPerfil, maybeSingle: perfilTelefono }
      eqPerfil.mockReturnValue(cadenaPerfil)
      return { select: () => cadenaPerfil }
    },
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
  eqLeads.mockReset()
  leadPrevio.mockReset()
  eqPerfil.mockReset()
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

  // Las dos lecturas se limitan explicitamente al usuario de la sesion (ver
  // el comentario de arriba sobre por que RLS solo no basta).
  expect(eqLeads).toHaveBeenCalledWith('comprador_id', 'comprador-1')
  expect(eqPerfil).toHaveBeenCalledWith('id', 'comprador-1')
})

it('con un lead previo enseña "ya contactaste" y no el formulario', async () => {
  resultado.mockResolvedValue({ data: PROPIEDAD, error: null })
  getUser.mockResolvedValue({ data: { user: { id: 'comprador-1' } } })
  leadPrevio.mockResolvedValue({ data: { id: 'lead-1' }, error: null })
  perfilTelefono.mockResolvedValue({ data: null, error: null })

  const html = renderToStaticMarkup(await Ficha({ params }))

  expect(html).toContain('Ya contactaste sobre esta propiedad.')
  expect(html).not.toContain('Contactar al vendedor')
  expect(eqLeads).toHaveBeenCalledWith('comprador_id', 'comprador-1')
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

/**
 * Hallazgo IMPORTANTE de revision. `leads` tiene DOS politicas permisivas de
 * SELECT que RLS combina con OR: leads_lectura_comprador Y
 * leads_lectura_vendedor (supabase/migrations/20260911000300_leads.sql:86-92).
 * Sin filtrar por comprador_id, un vendedor autenticado en su PROPIA ficha
 * tambien ve -- via la politica de vendedor -- el lead que un COMPRADOR le
 * dejo, y `yaContacto` sale true: la ficha le mostraria "Ya contactaste sobre
 * esta propiedad" en vez de nada, contradiciendo la intencion de
 * `esDelVendedor`. Mismo patron que la Task 11 de SP0 (RLS filtra por FILA
 * visible, no por "la fila que yo quiero").
 *
 * El mock de este archivo no ejecuta RLS de verdad, asi que `leadPrevio`
 * devuelve exactamente lo que Postgres devolveria YA FILTRADO por
 * comprador_id (null: el vendedor no tiene ningun lead propio como
 * comprador). La proteccion real de esta prueba esta en la ultima aserción:
 * si se quita el `.eq('comprador_id', ...)` del codigo, esta aserción se
 * vuelve falsa aunque el HTML de arriba siga pareciendo correcto (el mock no
 * cambia de resultado sin ese `.eq()` -- por eso no basta con mirar el HTML).
 */
it('al vendedor de su propia propiedad, con un lead de OTRO comprador, no le muestra "ya contactaste"', async () => {
  resultado.mockResolvedValue({ data: PROPIEDAD, error: null })
  getUser.mockResolvedValue({ data: { user: { id: PROPIEDAD.vendedor_id } } })
  leadPrevio.mockResolvedValue({ data: null, error: null })
  perfilTelefono.mockResolvedValue({ data: null, error: null })

  const html = renderToStaticMarkup(await Ficha({ params }))

  expect(html).not.toContain('Ya contactaste')
  expect(html).not.toContain('Contactar al vendedor')
  expect(html).not.toContain('Entra o crea cuenta')
  expect(eqLeads).toHaveBeenCalledWith('comprador_id', PROPIEDAD.vendedor_id)
  expect(eqPerfil).toHaveBeenCalledWith('id', PROPIEDAD.vendedor_id)
})
