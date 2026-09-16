import { describe, it, expect, vi } from 'vitest'
import {
  consultarMetricasEmbudo,
  consultarMetricasIA,
} from '@/lib/admin/metricas'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('Motor de Métricas Comerciales y Telemetría de IA (SP7)', () => {
  describe('consultarMetricasEmbudo', () => {
    it('maneja el caso de datos vacíos sin errores de división por cero', async () => {
      const clienteMock = {
        from: vi.fn().mockImplementation(() => {
          return {
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }),
      }

      const metricas = await consultarMetricasEmbudo(clienteMock as unknown as SupabaseClient)

      expect(metricas.propiedades.total).toBe(0)
      expect(metricas.leads.total).toBe(0)
      expect(metricas.leads.tasaConversion).toBe(0)
      expect(metricas.citas.total).toBe(0)
      expect(metricas.citas.tasaAgendamiento).toBe(0)
      expect(metricas.posicionamiento.montoRecaudadoCOP).toBe(0)
    })

    it('calcula correctamente tasas de conversión y totales con datos poblados', async () => {
      const clienteMock = {
        from: vi.fn().mockImplementation((tabla: string) => {
          if (tabla === 'propiedades') {
            return {
              select: vi.fn().mockResolvedValue({
                data: [
                  { estado: 'publicada', destacada: true },
                  { estado: 'publicada', destacada: false },
                  { estado: 'borrador', destacada: false },
                  { estado: 'rechazada', destacada: false },
                ],
                error: null,
              }),
            }
          }
          if (tabla === 'leads') {
            return {
              select: vi.fn().mockResolvedValue({
                data: [
                  { estado: 'aceptado' },
                  { estado: 'aceptado' },
                  { estado: 'descartado' },
                  { estado: 'nuevo' },
                ],
                error: null,
              }),
            }
          }
          if (tabla === 'citas') {
            return {
              select: vi.fn().mockResolvedValue({
                data: [
                  { estado: 'confirmada' },
                  { estado: 'cancelada' },
                ],
                error: null,
              }),
            }
          }
          if (tabla === 'pagos_posicionamiento') {
            return {
              select: vi.fn().mockResolvedValue({
                data: [
                  { monto: 100000, estado: 'activo' },
                  { monto: 50000, estado: 'expirado' },
                ],
                error: null,
              }),
            }
          }
          return { select: vi.fn().mockResolvedValue({ data: [], error: null }) }
        }),
      }

      const metricas = await consultarMetricasEmbudo(clienteMock as unknown as SupabaseClient)

      expect(metricas.propiedades.total).toBe(4)
      expect(metricas.propiedades.publicadas).toBe(2)
      expect(metricas.propiedades.destacadas).toBe(1)

      expect(metricas.leads.total).toBe(4)
      expect(metricas.leads.aceptados).toBe(2)
      // 2 aceptados de 4 totales = 50.0%
      expect(metricas.leads.tasaConversion).toBe(50.0)

      expect(metricas.citas.total).toBe(2)
      expect(metricas.citas.confirmadas).toBe(1)
      // 1 confirmada de 2 aceptados = 50.0%
      expect(metricas.citas.tasaAgendamiento).toBe(50.0)

      expect(metricas.posicionamiento.acuerdosTotales).toBe(2)
      expect(metricas.posicionamiento.acuerdosActivos).toBe(1)
      expect(metricas.posicionamiento.montoRecaudadoCOP).toBe(150000)
    })
  })

  describe('consultarMetricasIA', () => {
    it('computa turnos de conversación, estimación de tokens y costo', async () => {
      const clienteMock = {
        from: vi.fn().mockImplementation((tabla: string) => {
          if (tabla === 'conversaciones_ia') {
            return {
              select: vi.fn().mockResolvedValue({
                data: [{ estado: 'activa' }, { estado: 'cerrada' }],
                error: null,
              }),
            }
          }
          if (tabla === 'mensajes_ia') {
            return {
              select: vi.fn().mockResolvedValue({
                data: [
                  { rol: 'usuario', contenido: 'Hola, deseo visitar este apartamento en El Golf.' }, // 48 chars = 12 tokens in
                  { rol: 'asistente', contenido: 'Con gusto. ¿Deseas agendar para este sábado?' }, // 44 chars = 11 tokens out
                ],
                error: null,
              }),
            }
          }
          if (tabla === 'registro_auditoria') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ count: 2, error: null }),
              }),
            }
          }
          return { select: vi.fn().mockResolvedValue({ data: [], error: null }) }
        }),
      }

      const metricas = await consultarMetricasIA(clienteMock as unknown as SupabaseClient)

      expect(metricas.conversacionesTotales).toBe(2)
      expect(metricas.conversacionesCerradas).toBe(1)
      expect(metricas.mensajesTotales).toBe(2)
      expect(metricas.mensajesPorRol.usuario).toBe(1)
      expect(metricas.mensajesPorRol.asistente).toBe(1)
      expect(metricas.tokensEstimados.entrada).toBe(12)
      expect(metricas.tokensEstimados.salida).toBe(11)
      expect(metricas.tokensEstimados.total).toBe(23)
      expect(metricas.costoEstimadoUSD).toBeGreaterThanOrEqual(0)
      expect(metricas.incidentesRateLimit).toBe(2)
    })
  })
})
