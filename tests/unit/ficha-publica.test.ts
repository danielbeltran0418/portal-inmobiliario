vi.mock('server-only', () => ({}))
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
// `eqLeads`/`eqPerfil` son espias, no solo pasarelas: `leads` tiene TRES
// politicas permisivas de SELECT que RLS combina con OR
// (leads_lectura_comprador, leads_lectura_vendedor Y
// leads_lectura_super_admin, supabase/migrations/20260911000300_leads.sql) y
// `perfiles` tiene una de super_admin que tampoco restringe por id
// (perfil_lectura_super_admin), asi que el filtro por comprador_id/id en el
// codigo es OBLIGATORIO, no redundante -- mismo patron que ya mordio en la
// Task 11 de SP0. Un mock que solo devolviera datos fijos sin importar los
// argumentos de `.eq()` no detectaria que ese filtro desaparecio (los datos
// de prueba no cambian: en unit test no hay RLS de verdad). Por eso las
// pruebas de mas abajo aseveran tambien CON QUE se llamo a `.eq()` -- y,
// ademas, una prueba de COMPORTAMIENTO puro (mas abajo, marcada
// [comportamiento]) que simula el OR de RLS de verdad con una fila real: esa
// es la que falla por lo que se RENDERIZA si el filtro desaparece, no por
// como se llamo al mock.
const getUser = vi.fn()
const getSession = vi.fn()
const eqLeads = vi.fn()
const leadPrevio = vi.fn()
const eqPerfil = vi.fn()
const perfilTelefono = vi.fn()

/**
 * Simulacion de COMPORTAMIENTO (no de forma de llamada) del OR de RLS sobre
 * `leads`, para la prueba marcada [comportamiento] mas abajo. `eqLeads`/
 * `leadPrevio` de arriba prueban CON QUE se llamo a `.eq()`; esto prueba QUE
 * SE RENDERIZA, aplicando de verdad tanto los filtros que el codigo haya
 * encadenado (leidos en vivo, no fijados de antemano) como el OR de las
 * politicas leads_lectura_comprador/leads_lectura_vendedor: una fila solo
 * "existe" para `maybeSingle()` si pasa TODOS los `.eq()` que el codigo
 * encadeno Y si el usuario de la sesion es su comprador_id o su vendedor_id.
 * Si el codigo deja de filtrar por comprador_id, la fila sigue pasando el
 * unico `.eq('propiedad_id', ...)` que quede Y sigue siendo visible por RLS
 * (vendedor_id coincide) -- exactamente el fallo real, reproducido sin tocar
 * la base.
 */
let simularRlsLeads = false
let filaLeadSimulada: { propiedad_id: string; comprador_id: string; vendedor_id: string } | null = null
let idSesionSimulada: string | null = null

function builderLeadsSimulado() {
  const filtros: Record<string, unknown> = {}
  const builder = {
    eq(campo: string, valor: unknown) {
      filtros[campo] = valor
      return builder
    },
    maybeSingle: async () => {
      const fila = filaLeadSimulada
      if (!fila) return { data: null, error: null }
      const pasaFiltros = Object.entries(filtros)
        .every(([campo, valor]) => (fila as Record<string, unknown>)[campo] === valor)
      const visiblePorRls =
        fila.comprador_id === idSesionSimulada || fila.vendedor_id === idSesionSimulada
      return { data: (pasaFiltros && visiblePorRls) ? { id: 'lead-simulado' } : null, error: null }
    },
  }
  return builder
}

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser, getSession },
    from: (tabla: string) => {
      if (tabla === 'leads') {
        if (simularRlsLeads) return { select: () => builderLeadsSimulado() }
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
  simularRlsLeads = false
  filaLeadSimulada = null
  idSesionSimulada = null
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
 * Hallazgo IMPORTANTE de revision. `leads` tiene TRES politicas permisivas de
 * SELECT que RLS combina con OR: leads_lectura_comprador,
 * leads_lectura_vendedor Y leads_lectura_super_admin
 * (supabase/migrations/20260911000300_leads.sql:86-96).
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
 * comprador). Esta prueba solo comprueba, con la ultima aserción, CON QUE se
 * llamo a `.eq()` -- si alguien reescribe el filtro de otra forma equivalente
 * (`.match(...)`, por ejemplo), esta aserción se pone roja sin que nada este
 * roto, y si lo quita de una forma que el mock no observe, no se entera.
 * Por eso existe TAMBIEN la prueba [comportamiento] de mas abajo, que no mira
 * como se llamo al mock sino que RENDERIZA la fila.
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

/**
 * Hallazgo IMPORTANTE, ronda 2 de revision: la prueba de arriba solo prueba
 * la FORMA de la llamada (`toHaveBeenCalledWith`), y eso no es lo mismo que
 * el comportamiento -- el revisor lo demostro quitando los dos `.eq()` y
 * viendo que las aserciones sobre el HTML seguian pasando (solo caian las de
 * forma de llamada). Esta prueba [comportamiento] usa `builderLeadsSimulado`
 * (definido arriba) para aplicar de VERDAD, sobre una fila real de un lead
 * dejado por OTRO comprador sobre esta misma propiedad: (a) los filtros que
 * el codigo haya encadenado, leidos en vivo desde la llamada real a `.eq()`,
 * y (b) el OR de RLS -- la fila es visible si el usuario de la sesion es su
 * comprador_id O su vendedor_id (leads_lectura_comprador /
 * leads_lectura_vendedor).
 *
 * Con el filtro puesto: el WHERE exige comprador_id = vendedor-1, la fila
 * tiene comprador_id = 'otro-comprador' -> no pasa el filtro -> sin fila ->
 * sin "ya contactaste", sea cual sea el OR de RLS.
 *
 * Sin el filtro (falsificando): el WHERE solo exige propiedad_id (que
 * coincide) -> pasa el filtro; y la fila tiene vendedor_id = vendedor-1,
 * igual al usuario de la sesion -> visible por RLS via la politica de
 * vendedor -> la fila "existe" -> el HTML muestra "Ya contactaste". Esta
 * prueba falla por lo que se RENDERIZA, no por como se llamo al mock.
 */
it('[comportamiento] un lead real de OTRO comprador no hace que el vendedor vea "ya contactaste"', async () => {
  resultado.mockResolvedValue({ data: PROPIEDAD, error: null })
  getUser.mockResolvedValue({ data: { user: { id: PROPIEDAD.vendedor_id } } })
  perfilTelefono.mockResolvedValue({ data: null, error: null })

  simularRlsLeads = true
  idSesionSimulada = PROPIEDAD.vendedor_id
  filaLeadSimulada = {
    propiedad_id: PROPIEDAD.id,
    comprador_id: 'otro-comprador',
    vendedor_id: PROPIEDAD.vendedor_id,
  }

  const html = renderToStaticMarkup(await Ficha({ params }))

  expect(html).not.toContain('Ya contactaste')
  expect(html).not.toContain('Contactar al vendedor')
  expect(html).not.toContain('Entra o crea cuenta')
})
