import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const sesionActual = vi.fn()
const redirect = vi.fn()

vi.mock('@/lib/auth/sesion', () => ({ sesionActual }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => ({}) }))
vi.mock('next/navigation', () => ({ redirect, notFound: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Consultas falsas CON comportamiento: devuelven las filas del vendedor que se
// les pida. Si la pagina pidiera las de otro id, pintaria las del otro.
vi.mock('@/lib/citas/consultas', () => ({
  leerDisponibilidad: async (_cliente: unknown, vendedorId: string) => horarios[vendedorId] ?? [],
  leerFechasBloqueadas: async (_cliente: unknown, vendedorId: string) => bloqueos[vendedorId] ?? [],
}))

const VENDEDOR = 'vendedor-de-la-sesion'
const OTRO = 'otro-vendedor'
let horarios: Record<string, { id: string; dia_semana: number; hora_inicio: string; hora_fin: string }[]> = {}
let bloqueos: Record<string, { id: string; desde: string; hasta: string }[]> = {}

const { default: PaginaDisponibilidad, metadata } = await import('@/app/(vendedor)/panel/disponibilidad/page')
const { FormularioFranja, FormularioBloqueo, EliminarFranja, Desbloquear } = await import(
  '@/app/(vendedor)/panel/disponibilidad/formularios'
)

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
  horarios = {
    [VENDEDOR]: [{ id: 'f1', dia_semana: 4, hora_inicio: '15:00:00', hora_fin: '16:00:00' }],
    [OTRO]: [{ id: 'f9', dia_semana: 1, hora_inicio: '08:00:00', hora_fin: '09:00:00' }],
  }
  bloqueos = {
    [VENDEDOR]: [{ id: 'b1', desde: '2026-12-24', hasta: '2026-12-26' }],
    [OTRO]: [{ id: 'b9', desde: '2026-01-01', hasta: '2026-01-01' }],
  }
})

describe('/panel/disponibilidad', () => {
  it('es privada', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('sin sesion redirige a /login', async () => {
    sesionActual.mockResolvedValue({ hayUsuario: false, accessToken: null, idUsuario: null })
    await expect(PaginaDisponibilidad()).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('muestra el horario y los bloqueos del vendedor de la sesion, cada uno con su boton', async () => {
    const elemento = await PaginaDisponibilidad()
    const texto = textoPlano(elemento)

    expect(texto).toContain('jueves · 15:00 – 16:00')
    expect(texto).toContain('2026-12-24 a 2026-12-26')
    expect(texto).not.toContain('lunes · 08:00 – 09:00')
    expect(texto).not.toContain('2026-01-01')

    expect(buscarTodos(elemento, (n) => n.type === EliminarFranja).map((n) => n.props?.id)).toEqual(['f1'])
    expect(buscarTodos(elemento, (n) => n.type === Desbloquear).map((n) => n.props?.id)).toEqual(['b1'])
    expect(buscarTodos(elemento, (n) => n.type === FormularioFranja)).toHaveLength(1)
    expect(buscarTodos(elemento, (n) => n.type === FormularioBloqueo)).toHaveLength(1)
  })

  it('sin horario avisa de que nadie puede reservar', async () => {
    horarios = {}
    const texto = textoPlano(await PaginaDisponibilidad())
    expect(texto).toContain('Todav\u00eda no has definido tu horario: nadie puede reservarte visitas.')
  })

  it('FormularioFranja ofrece los siete dias y horas en punto hasta las 24:00', () => {
    const html = renderToStaticMarkup(createElement(FormularioFranja))
    expect(html).toContain('name="dia_semana"')
    expect(html).toContain('value="7"')
    expect(html).toContain('>domingo<')
    expect(html).toContain('name="hora_inicio"')
    expect(html).toContain('value="00:00"')
    expect(html).toContain('name="hora_fin"')
    expect(html).toContain('value="24:00"')
    expect(html).not.toContain('value="00:30"')
    expect(html).toContain('Agregar franja')
  })

  it('FormularioBloqueo pide dos fechas', () => {
    const html = renderToStaticMarkup(createElement(FormularioBloqueo))
    expect(html).toContain('name="desde"')
    expect(html).toContain('name="hasta"')
    expect(html).toContain('type="date"')
    expect(html).toContain('Bloquear fechas')
  })
})
