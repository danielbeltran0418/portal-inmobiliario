import { describe, it, expect, vi, beforeEach } from 'vitest'

const sesionActual = vi.fn()
const redirect = vi.fn()
const notFound = vi.fn()

vi.mock('@/lib/auth/sesion', () => ({ sesionActual }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => ({}) }))
vi.mock('next/navigation', () => ({ redirect, notFound }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Consultas falsas CON comportamiento: responden segun el id y el papel pedidos.
vi.mock('@/lib/citas/consultas', () => ({
  listarSolicitudesDelComprador: async (_c: unknown, compradorId: string) => solicitudesPorComprador[compradorId] ?? [],
  obtenerLeadParaReservar: async (_c: unknown, leadId: string, compradorId: string) =>
    leadsReservables.find((l) => l.lead.id === leadId && l.compradorId === compradorId)?.lead ?? null,
  obtenerCitaDeParticipante: async (_c: unknown, citaId: string, usuarioId: string, papel: string) =>
    participaciones.find((p) => p.cita.id === citaId && p.usuarioId === usuarioId && p.papel === papel)?.cita ?? null,
  obtenerFranjasLibres: async (_c: unknown, vendedorId: string) => franjasPorVendedor[vendedorId] ?? [],
}))

const COMPRADOR = 'comprador-de-la-sesion'
const VENDEDOR = 'vendedor-del-lead'
const LEAD_ACEPTADO = '4d8e2f9a-1b3c-4d5e-8f6a-7b8c9d0e1f2a'
const LEAD_NUEVO = '5e9f3a0b-2c4d-4e6f-9a7b-8c9d0e1f2a3b'
const LEAD_CON_VISITA = '6fa04b1c-3d5e-4f7a-8b8c-9d0e1f2a3b4c'
const CITA = '7ab15c2d-4e6f-4a8b-9c9d-0e1f2a3b4c5d'
const RANGO = { inicio: '2026-09-17T20:00:00.000Z', fin: '2026-09-17T21:00:00.000Z' }
const FRANJA = { inicio: '2026-09-18T15:00:00+00:00', fin: '2026-09-18T16:00:00+00:00' }
const AVISO = 'La dirección aparecerá 2 horas antes de la visita'

let solicitudesPorComprador: Record<string, unknown[]> = {}
let leadsReservables: { compradorId: string; lead: Record<string, unknown> }[] = []
let participaciones: { usuarioId: string; papel: string; cita: Record<string, unknown> }[] = []
let franjasPorVendedor: Record<string, unknown[]> = {}

const { default: PaginaMiCuenta } = await import('@/app/(comprador)/mi-cuenta/page')
const { default: PaginaReservarVisita } = await import('@/app/(comprador)/mi-cuenta/reservar/[leadId]/page')
const { default: PaginaMoverMiVisita } = await import('@/app/(comprador)/mi-cuenta/visitas/[id]/mover/page')
const { AccionesCita } = await import('@/componentes/citas/acciones-cita')
const { SelectorFranjas } = await import('@/componentes/citas/selector-franjas')
const { MENSAJE_VISITA_LEAD_NO_ACEPTADO } = await import('@/lib/errores/mapear')

const normalizar = (texto: string) => texto.replace(/\s/g, ' ')

function textoPlano(nodo: unknown): string {
  if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return ''
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo)
  if (Array.isArray(nodo)) return nodo.map(textoPlano).join('')
  if (typeof nodo === 'object' && 'props' in (nodo as Record<string, unknown>)) {
    return textoPlano((nodo as { props?: { children?: unknown } }).props?.children)
  }
  return ''
}

type Nodo = { type?: unknown; props?: Record<string, unknown> }
function buscarTodos(nodo: unknown, predicado: (n: Nodo) => boolean, hallados: Nodo[] = []): Nodo[] {
  if (nodo === null || nodo === undefined || typeof nodo !== 'object') return hallados
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) buscarTodos(hijo, predicado, hallados)
    return hallados
  }
  const elemento = nodo as Nodo
  if (predicado(elemento)) hallados.push(elemento)
  if (elemento.props) buscarTodos(elemento.props.children, predicado, hallados)
  return hallados
}

const enlaces = (elemento: unknown) =>
  buscarTodos(elemento, (n) => typeof n.props?.href === 'string').map((n) => n.props!.href as string)

function solicitud(campos: Record<string, unknown>) {
  return { estado: 'aceptado', propiedadId: 'prop-1', tituloPropiedad: 'Casa en Riomar', visita: null, direccion: null, ...campos }
}

beforeEach(() => {
  sesionActual.mockReset().mockResolvedValue({ hayUsuario: true, accessToken: 't', idUsuario: COMPRADOR })
  redirect.mockReset().mockImplementation((ruta: string) => { throw new Error(`NEXT_REDIRECT:${ruta}`) })
  notFound.mockReset().mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
  solicitudesPorComprador = {
    [COMPRADOR]: [
      solicitud({ id: LEAD_ACEPTADO }),
      solicitud({ id: LEAD_NUEVO, estado: 'nuevo', tituloPropiedad: 'Apartamento en El Prado' }),
    ],
    'otro-comprador': [solicitud({ id: 'ajeno', tituloPropiedad: 'Lote ajeno' })],
  }
  leadsReservables = [
    { compradorId: COMPRADOR, lead: { id: LEAD_ACEPTADO, estado: 'aceptado', vendedorId: VENDEDOR, tituloPropiedad: 'Casa en Riomar' } },
    { compradorId: COMPRADOR, lead: { id: LEAD_NUEVO, estado: 'nuevo', vendedorId: VENDEDOR, tituloPropiedad: 'Apartamento en El Prado' } },
  ]
  participaciones = [
    { usuarioId: COMPRADOR, papel: 'comprador', cita: { id: CITA, estado: 'confirmada', vendedorId: VENDEDOR, ...RANGO } },
  ]
  franjasPorVendedor = { [VENDEDOR]: [FRANJA] }
})

describe('/mi-cuenta', () => {
  it('sin sesion redirige a /login', async () => {
    sesionActual.mockResolvedValue({ hayUsuario: false, accessToken: null, idUsuario: null })
    await expect(PaginaMiCuenta()).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('muestra solo las solicitudes del comprador de la sesion', async () => {
    const texto = textoPlano(await PaginaMiCuenta())
    expect(texto).toContain('Mi cuenta')
    expect(texto).toContain('Casa en Riomar')
    expect(texto).toContain('Apartamento en El Prado')
    expect(texto).not.toContain('Lote ajeno')
  })

  it('un lead aceptado sin visita ofrece Reservar visita; uno nuevo no', async () => {
    const destinos = enlaces(await PaginaMiCuenta())
    expect(destinos).toContain(`/mi-cuenta/reservar/${LEAD_ACEPTADO}`)
    expect(destinos).not.toContain(`/mi-cuenta/reservar/${LEAD_NUEVO}`)
  })

  it('fuera de la ventana muestra la hora de Bogota y el aviso, nunca una direccion', async () => {
    solicitudesPorComprador[COMPRADOR] = [
      solicitud({ id: LEAD_CON_VISITA, visita: { id: CITA, ...RANGO }, direccion: null }),
    ]
    const elemento = await PaginaMiCuenta()
    const texto = normalizar(textoPlano(elemento))

    expect(texto).toContain('jueves, 17 de septiembre, 3:00 p. m.')
    expect(texto).toContain(AVISO)
    expect(texto).not.toContain('Dirección:')
    expect(enlaces(elemento)).not.toContain(`/mi-cuenta/reservar/${LEAD_CON_VISITA}`)
    expect(buscarTodos(elemento, (n) => n.type === AccionesCita).map((n) => n.props)).toEqual([
      { citaId: CITA, rutaMover: `/mi-cuenta/visitas/${CITA}/mover`, tardia: expect.any(Boolean) },
    ])
  })

  it('dentro de la ventana muestra la direccion que devolvio la base', async () => {
    solicitudesPorComprador[COMPRADOR] = [
      solicitud({ id: LEAD_CON_VISITA, visita: { id: CITA, ...RANGO }, direccion: 'Carrera 50 # 80-12' }),
    ]
    const texto = textoPlano(await PaginaMiCuenta())
    expect(texto).toContain('Dirección: Carrera 50 # 80-12')
    expect(texto).not.toContain(AVISO)
  })

  it('sin solicitudes lo dice', async () => {
    solicitudesPorComprador = {}
    expect(textoPlano(await PaginaMiCuenta())).toContain('Todavía no has contactado a ningún vendedor.')
  })
})

describe('/mi-cuenta/reservar/[leadId]', () => {
  it('un lead que no es del comprador de la sesion da notFound', async () => {
    sesionActual.mockResolvedValue({ hayUsuario: true, accessToken: 't', idUsuario: 'otro-comprador' })
    await expect(PaginaReservarVisita({ params: Promise.resolve({ leadId: LEAD_ACEPTADO }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('un lead no aceptado no ofrece franjas', async () => {
    const elemento = await PaginaReservarVisita({ params: Promise.resolve({ leadId: LEAD_NUEVO }) })
    expect(textoPlano(elemento)).toContain(MENSAJE_VISITA_LEAD_NO_ACEPTADO)
    expect(buscarTodos(elemento, (n) => n.type === SelectorFranjas)).toEqual([])
  })

  it('ofrece las franjas del vendedor del lead en modo reservar', async () => {
    const elemento = await PaginaReservarVisita({ params: Promise.resolve({ leadId: LEAD_ACEPTADO }) })
    const [selector] = buscarTodos(elemento, (n) => n.type === SelectorFranjas)
    expect(selector?.props?.modo).toBe('reservar')
    expect(selector?.props?.objetivoId).toBe(LEAD_ACEPTADO)
    expect(selector?.props?.volverA).toBe('/mi-cuenta')
    const grupos = selector?.props?.grupos as { franjas: { inicio: string }[] }[]
    expect(grupos.flatMap((g) => g.franjas.map((f) => f.inicio))).toEqual([FRANJA.inicio])
  })
})

describe('/mi-cuenta/visitas/[id]/mover', () => {
  it('una visita en la que el comprador no participa da notFound', async () => {
    participaciones = []
    await expect(PaginaMoverMiVisita({ params: Promise.resolve({ id: CITA }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('ofrece las franjas del vendedor de la visita en modo mover y vuelve a /mi-cuenta', async () => {
    const elemento = await PaginaMoverMiVisita({ params: Promise.resolve({ id: CITA }) })
    const [selector] = buscarTodos(elemento, (n) => n.type === SelectorFranjas)
    expect(selector?.props?.modo).toBe('mover')
    expect(selector?.props?.objetivoId).toBe(CITA)
    expect(selector?.props?.volverA).toBe('/mi-cuenta')
  })
})
