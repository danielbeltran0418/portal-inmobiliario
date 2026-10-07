import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { consultarMetricasEmbudo, consultarMetricasIA } from '@/lib/admin/metricas'

const AGREGADOS = {
  propiedades: { total: 4, publicadas: 2, borradores: 1, pausadas_o_rechazadas: 1, destacadas: 1 },
  leads: { total: 4, nuevos: 1, aceptados: 2, descartados: 1 },
  citas: { total: 2, confirmadas: 1, canceladas: 1, realizadas: 1 },
  posicionamiento: { total: 2, activos: 1, monto: '150000.00' },
  conversaciones: { total: 2, cerradas: 1 },
  mensajes: { total: 3, comprador: 1, agente_ia: 2, sistema: 0, tokens_entrada: '1000000', tokens_salida: 500000 },
  incidentes_limite: 3,
}

function cliente(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  const from = vi.fn()
  return { db: { rpc, from } as unknown as SupabaseClient, rpc, from }
}

describe('Métricas del panel de control (agregadas en la base)', () => {
  it('una sola llamada a metricas_panel_control para embudo e IA, sin leer tablas', async () => {
    const { db, rpc, from } = cliente(AGREGADOS)
    await Promise.all([consultarMetricasEmbudo(db), consultarMetricasIA(db)])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('metricas_panel_control')
    expect(from).not.toHaveBeenCalled()
  })

  it('calcula tasas y convierte los numeric que llegan como texto', async () => {
    const m = await consultarMetricasEmbudo(cliente(AGREGADOS).db)
    expect(m.leads.tasaConversion).toBe(50)
    expect(m.citas.tasaAgendamiento).toBe(50)
    expect(m.citas.completadas).toBe(1)
    expect(m.propiedades.rechazadas).toBe(1)
    expect(m.posicionamiento.montoRecaudadoCOP).toBe(150000)
  })

  it('sin datos no divide por cero', async () => {
    const vacio = {
      ...AGREGADOS,
      leads: { total: 0, nuevos: 0, aceptados: 0, descartados: 0 },
      citas: { total: 0, confirmadas: 0, canceladas: 0, realizadas: 0 },
    }
    const m = await consultarMetricasEmbudo(cliente(vacio).db)
    expect(m.leads.tasaConversion).toBe(0)
    expect(m.citas.tasaAgendamiento).toBe(0)
  })

  it('la IA usa los tokens reales y su costo', async () => {
    const ia = await consultarMetricasIA(cliente(AGREGADOS).db)
    expect(ia.tokensEstimados).toEqual({ entrada: 1_000_000, salida: 500_000, total: 1_500_000 })
    expect(ia.costoEstimadoUSD).toBe(0.6)
    expect(ia.mensajesPorRol).toEqual({ usuario: 1, asistente: 2, sistema: 0 })
    expect(ia.conversacionesCerradas).toBe(1)
    expect(ia.incidentesRateLimit).toBe(3)
  })

  it('un fallo de la base no se disfraza de ceros', async () => {
    await expect(consultarMetricasEmbudo(cliente(null, { message: 'caida' }).db)).rejects.toThrow(/metricas/)
  })
})
