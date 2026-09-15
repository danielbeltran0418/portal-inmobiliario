import { describe, it, expect, vi, beforeEach } from 'vitest'

const sesionActual = vi.fn()
const redirect = vi.fn()
const notFound = vi.fn()

vi.mock('@/lib/auth/sesion', () => ({ sesionActual }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => ({}) }))
vi.mock('next/navigation', () => ({ redirect, notFound }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Consultas falsas CON comportamiento: responden segun el id y el papel que
// se les pida, como lo haria la base con el filtro explicito.
vi.mock('@/lib/citas/consultas', () => ({
  listarCitasDelVendedor: async (_c: unknown, vendedorId: string) => citasPorVendedor[vendedorId] ?? [],
  obtenerCitaDeParticipante: async (_c: unknown, citaId: string, usuarioId: string, papel: string) =>
    participaciones.find((p) => p.cita.id === citaId && p.usuarioId === usuarioId && p.papel === papel)?.cita ?? null,
  obtenerFranjasLibres: async (_c: unknown, vendedorId: string) => franjasPorVendedor[vendedorId] ?? [],
}))

const VENDEDOR = 'vendedor-de-la-sesion'
const ID_CONFIRMADA = '1b6f0c7e-2d4a-4c3b-9e8f-0a1b2c3d4e5f'
const ID_CANCELADA = '2c7a1d8f-3e5b-4d4c-8f9a-1b2c3d4e5f60'
const RANGO = { inicio: '2026-09-17T20:00:00.000Z', fin: '2026-09-17T21:00:00.000Z' }
const FRANJA = { inicio: '2026-09-18T15:00:00+00:00', fin: '2026-09-18T16:00:00+00:00' }

let citasPorVendedor: Record<string, unknown[]> = {}
let participaciones: { usuarioId: string; papel: string; cita: Record<string, unknown> }[] = []
let franjasPorVendedor: Record<string, unknown[]> = {}

const { default: PaginaCitasVendedor, metadata: metadataCitas } = await import('@/app/(vendedor)/panel/citas/page')
const { default: PaginaMoverCitaVendedor, metadata: metadataMover } = await import(
  '@/app/(vendedor)/panel/citas/[id]/mover/page'
)
const { AccionesCita } = await import('@/componentes/citas/acciones-cita')
const { SelectorFranjas } = await import('@/componentes/citas/selector-franjas')

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

beforeEach(() => {
  sesionActual.mockReset().mockResolvedValue({ hayUsuario: true, accessToken: 't', idUsuario: VENDEDOR })
  redirect.mockReset().mockImplementation((ruta: string) => { throw new Error(`NEXT_REDIRECT:${ruta}`) })
  notFound.mockReset().mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
  citasPorVendedor = {
    [VENDEDOR]: [
      { id: ID_CONFIRMADA, estado: 'confirmada', ...RANGO, tituloPropiedad: 'Casa en Riomar', nombreComprador: 'Ana Compradora' },
      { id: ID_CANCELADA, estado: 'cancelada', ...RANGO, tituloPropiedad: 'Apartamento en El Prado', nombreComprador: 'Luis' },
    ],
    'otro-vendedor': [
      { id: 'ajena', estado: 'confirmada', ...RANGO, tituloPropiedad: 'Lote ajeno', nombreComprador: 'Nadie' },
    ],
  }
  participaciones = [
    { usuarioId: VENDEDOR, papel: 'vendedor', cita: { id: ID_CONFIRMADA, estado: 'confirmada', vendedorId: VENDEDOR, ...RANGO } },
  ]
  franjasPorVendedor = { [VENDEDOR]: [FRANJA] }
})

describe('/panel/citas', () => {
  it('las dos paginas son privadas', () => {
    expect(metadataCitas.robots).toEqual({ index: false, follow: false })
    expect(metadataMover.robots).toEqual({ index: false, follow: false })
  })

  it('sin sesion redirige a /login', async () => {
    sesionActual.mockResolvedValue({ hayUsuario: false, accessToken: null, idUsuario: null })
    await expect(PaginaCitasVendedor()).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('lista las visitas del vendedor de la sesion en hora de Bogota, con acciones solo en las confirmadas', async () => {
    const elemento = await PaginaCitasVendedor()
    const texto = normalizar(textoPlano(elemento))

    expect(texto).toContain('Casa en Riomar')
    expect(texto).toContain('Ana Compradora')
    expect(texto).toContain('jueves, 17 de septiembre, 3:00 p. m.')
    expect(texto).toContain('Apartamento en El Prado')
    expect(texto).not.toContain('Lote ajeno')

    const acciones = buscarTodos(elemento, (n) => n.type === AccionesCita)
    expect(acciones.map((n) => n.props)).toEqual([
      { citaId: ID_CONFIRMADA, rutaMover: `/panel/citas/${ID_CONFIRMADA}/mover` },
    ])
  })
})

describe('/panel/citas/[id]/mover', () => {
  it('una visita en la que el vendedor no participa da notFound', async () => {
    participaciones = []
    await expect(PaginaMoverCitaVendedor({ params: Promise.resolve({ id: ID_CONFIRMADA }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('un id que no es un uuid da notFound', async () => {
    await expect(PaginaMoverCitaVendedor({ params: Promise.resolve({ id: 'no-es-un-uuid' }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('ofrece las franjas libres del vendedor de la visita en modo mover', async () => {
    const elemento = await PaginaMoverCitaVendedor({ params: Promise.resolve({ id: ID_CONFIRMADA }) })
    const [selector] = buscarTodos(elemento, (n) => n.type === SelectorFranjas)

    expect(selector?.props?.modo).toBe('mover')
    expect(selector?.props?.objetivoId).toBe(ID_CONFIRMADA)
    expect(selector?.props?.volverA).toBe('/panel/citas')
    const grupos = selector?.props?.grupos as { franjas: { inicio: string }[] }[]
    expect(grupos.flatMap((g) => g.franjas.map((f) => f.inicio))).toEqual([FRANJA.inicio])
  })
})
