import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Los componentes importan las server actions, que importan el cliente de
// Supabase (next/headers) y next/cache: se sustituyen, no se ejercitan aqui.
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => ({}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { agruparFranjasPorDia } = await import('@/lib/citas/agrupar')
const { SelectorFranjas } = await import('@/componentes/citas/selector-franjas')
const { AccionesCita } = await import('@/componentes/citas/acciones-cita')

const normalizar = (texto: string) => texto.replace(/\s/g, ' ')

describe('agruparFranjasPorDia', () => {
  it('agrupa por dia de Bogota, en el orden recibido, con la hora ya formateada', () => {
    const grupos = agruparFranjasPorDia([
      { inicio: '2026-09-17T20:00:00+00:00', fin: '2026-09-17T21:00:00+00:00' },
      // 01:00 UTC del 18 es el jueves 17 a las 8:00 p. m. en Bogota.
      { inicio: '2026-09-18T01:00:00+00:00', fin: '2026-09-18T02:00:00+00:00' },
      { inicio: '2026-09-18T13:00:00+00:00', fin: '2026-09-18T14:00:00+00:00' },
    ])

    expect(grupos.map((g) => g.clave)).toEqual(['2026-09-17', '2026-09-18'])
    expect(normalizar(grupos[0]!.dia)).toBe('jueves, 17 de septiembre')
    expect(grupos[0]!.franjas.map((f) => normalizar(f.hora))).toEqual(['3:00 p. m.', '8:00 p. m.'])
    expect(grupos[0]!.franjas[1]!.inicio).toBe('2026-09-18T01:00:00+00:00')
    expect(normalizar(grupos[1]!.dia)).toBe('viernes, 18 de septiembre')
    expect(grupos[1]!.franjas.map((f) => normalizar(f.hora))).toEqual(['8:00 a. m.'])
  })

  it('sin franjas devuelve una lista vacia', () => {
    expect(agruparFranjasPorDia([])).toEqual([])
  })
})

const GRUPOS = [
  { clave: '2026-09-17', dia: 'jueves, 17 de septiembre', franjas: [
    { inicio: '2026-09-17T20:00:00+00:00', hora: '3:00 p. m.' },
    { inicio: '2026-09-17T21:00:00+00:00', hora: '4:00 p. m.' },
  ] },
]

describe('SelectorFranjas', () => {
  it('en modo reservar lleva el lead en un campo oculto y una franja por boton, con su instante como valor', () => {
    const html = renderToStaticMarkup(createElement(SelectorFranjas, {
      modo: 'reservar', objetivoId: 'lead-1', grupos: GRUPOS, volverA: '/mi-cuenta',
    }))
    expect(html).toContain('name="lead_id"')
    expect(html).toContain('value="lead-1"')
    expect(html).not.toContain('name="cita_id"')
    expect(html).toContain('jueves, 17 de septiembre')
    expect(html).toContain('name="inicio"')
    expect(html).toContain('value="2026-09-17T20:00:00+00:00"')
    expect(html).toContain('3:00 p. m.')
    expect(html).toContain('value="2026-09-17T21:00:00+00:00"')
  })

  it('en modo mover lleva la cita, no el lead', () => {
    const html = renderToStaticMarkup(createElement(SelectorFranjas, {
      modo: 'mover', objetivoId: 'cita-1', grupos: GRUPOS, volverA: '/panel/citas',
    }))
    expect(html).toContain('name="cita_id"')
    expect(html).toContain('value="cita-1"')
    expect(html).not.toContain('name="lead_id"')
  })

  it('sin franjas lo dice en vez de pintar un formulario vacio', () => {
    const html = renderToStaticMarkup(createElement(SelectorFranjas, {
      modo: 'reservar', objetivoId: 'lead-1', grupos: [], volverA: '/mi-cuenta',
    }))
    expect(html).toContain('No hay franjas libres en los próximos 14 días.')
    expect(html).not.toContain('<form')
  })
})

describe('AccionesCita', () => {
  it('enlaza a mover y cancela con la cita en un campo oculto', () => {
    const html = renderToStaticMarkup(createElement(AccionesCita, {
      citaId: 'cita-1', rutaMover: '/mi-cuenta/visitas/cita-1/mover',
    }))
    expect(html).toContain('href="/mi-cuenta/visitas/cita-1/mover"')
    expect(html).toContain('>Mover<')
    expect(html).toContain('name="cita_id"')
    expect(html).toContain('value="cita-1"')
    expect(html).toContain('>Cancelar<')
  })
})
