import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { agruparPorMes, consultarSerieMensual } from '@/lib/admin/metricas'
import { GraficoMensual } from '@/components/admin/GraficoMensual'

const HOY = new Date('2026-10-07T15:00:00Z')

describe('agruparPorMes', () => {
  it('devuelve los ultimos N meses en orden, incluidos los vacios', () => {
    const serie = agruparPorMes([], [], 3, HOY)
    expect(serie.map((m) => m.clave)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(serie.every((m) => m.leads === 0 && m.citas === 0)).toBe(true)
  })

  it('cuenta leads y citas por mes en hora de Colombia', () => {
    const serie = agruparPorMes(
      ['2026-10-01T12:00:00Z', '2026-09-15T00:00:00Z', '2026-10-01T03:00:00Z'],
      ['2026-10-02T10:00:00Z'],
      3,
      HOY,
    )
    // 2026-10-01T03:00Z son las 22:00 del 30 de septiembre en Bogota.
    expect(serie.find((m) => m.clave === '2026-09')).toMatchObject({ leads: 2, citas: 0 })
    expect(serie.find((m) => m.clave === '2026-10')).toMatchObject({ leads: 1, citas: 1 })
  })

  it('ignora fechas fuera de la ventana', () => {
    const serie = agruparPorMes(['2025-01-01T12:00:00Z'], [], 3, HOY)
    expect(serie.reduce((s, m) => s + m.leads, 0)).toBe(0)
  })

  it('cruza el cambio de año', () => {
    const serie = agruparPorMes([], [], 3, new Date('2027-01-10T12:00:00Z'))
    expect(serie.map((m) => m.clave)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(serie[0]!.etiqueta).toMatch(/nov/i)
  })
})

describe('consultarSerieMensual', () => {
  it('pide solo creado_en desde el primer dia de la ventana', async () => {
    const gte = vi.fn().mockResolvedValue({ data: [{ creado_en: '2026-10-03T12:00:00Z' }], error: null })
    const select = vi.fn(() => ({ gte }))
    const cliente = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient
    const serie = await consultarSerieMensual(cliente, 6, HOY)
    expect(select).toHaveBeenCalledWith('creado_en')
    expect(gte).toHaveBeenCalledWith('creado_en', '2026-05-01T05:00:00.000Z')
    expect(serie).toHaveLength(6)
    expect(serie.at(-1)).toMatchObject({ leads: 1, citas: 1 })
  })
})

describe('GraficoMensual', () => {
  it('pinta una barra por serie y mes, con leyenda y tabla accesible', () => {
    const html = renderToStaticMarkup(createElement(GraficoMensual, {
      serie: agruparPorMes(['2026-10-03T12:00:00Z', '2026-10-04T12:00:00Z'], ['2026-10-05T12:00:00Z'], 2, HOY),
    }))
    expect(html).toContain('Leads')
    expect(html).toContain('Citas')
    expect(html).toMatch(/<table[^>]*class="[^"]*sr-only/)
    expect(html).toContain('<td>2</td>')
    // La barra mas alta llega al 100%; la de la mitad, al 50%.
    expect(html).toContain('height:100%')
    expect(html).toContain('height:50%')
  })

  it('sin actividad lo dice en vez de pintar barras vacias', () => {
    const html = renderToStaticMarkup(createElement(GraficoMensual, { serie: agruparPorMes([], [], 3, HOY) }))
    expect(html).toContain('Todavía no hay leads ni citas')
  })
})
