import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  esquemaPagoPosicionamiento,
  registrarPagoPosicionamiento,
  cancelarPagoPosicionamiento,
} from '@/lib/admin/posicionamiento'
import type { SupabaseClient } from '@supabase/supabase-js'

interface ClienteMock {
  from: ReturnType<typeof vi.fn>
}

interface AdminMock {
  rpc: ReturnType<typeof vi.fn>
}

describe('Servicios y Esquemas de Posicionamiento Pagado (SP7)', () => {
  let clienteMock: ClienteMock
  let adminMock: AdminMock

  beforeEach(() => {
    adminMock = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    }

    clienteMock = {
      from: vi.fn(),
    }
  })

  describe('esquemaPagoPosicionamiento (validaciones Zod)', () => {
    it('valida exitosamente un acuerdo con fechas coherentes y monto positivo', () => {
      const ahora = new Date()
      const fin = new Date(ahora.getTime() + 7 * 24 * 3600 * 1000)

      const input = {
        propiedad_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        monto: '150000',
        moneda: 'COP',
        fecha_inicio: ahora.toISOString(),
        fecha_fin: fin.toISOString(),
        notas: 'Acuerdo transferido por Bancolombia',
      }

      const res = esquemaPagoPosicionamiento.safeParse(input)
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data.monto).toBe(150000)
      }
    })

    it('rechaza montos negativos', () => {
      const ahora = new Date()
      const fin = new Date(ahora.getTime() + 7 * 24 * 3600 * 1000)

      const input = {
        propiedad_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        monto: -5000,
        fecha_inicio: ahora.toISOString(),
        fecha_fin: fin.toISOString(),
      }

      const res = esquemaPagoPosicionamiento.safeParse(input)
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('El monto no puede ser negativo')
      }
    })

    it('rechaza si fecha_fin es anterior o igual a fecha_inicio', () => {
      const ahora = new Date()
      const anterior = new Date(ahora.getTime() - 1000)

      const input = {
        propiedad_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        monto: 50000,
        fecha_inicio: ahora.toISOString(),
        fecha_fin: anterior.toISOString(),
      }

      const res = esquemaPagoPosicionamiento.safeParse(input)
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('posterior a la fecha de inicio')
      }
    })
  })

  describe('registrarPagoPosicionamiento', () => {
    it('falla si la propiedad no existe', async () => {
      const singleMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singleMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      clienteMock.from.mockReturnValue({ select: selectMock })

      const ahora = new Date()
      const fin = new Date(ahora.getTime() + 5 * 24 * 3600 * 1000)

      const res = await registrarPagoPosicionamiento(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        {
          propiedad_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          monto: 80000,
          fecha_inicio: ahora.toISOString(),
          fecha_fin: fin.toISOString(),
        },
        'admin-001',
      )

      expect(res.ok).toBe(false)
      expect(res.error).toContain('Propiedad no encontrada')
    })

    it('registra exitosamente el pago y emite auditoría posicionamiento_activado', async () => {
      const singlePropMock = vi.fn().mockResolvedValue({
        data: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', vendedor_id: 'vend-001', estado: 'publicada' },
        error: null,
      })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singlePropMock })
      const selectPropMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      const singleInsertMock = vi.fn().mockResolvedValue({
        data: { id: 'pago-999' },
        error: null,
      })
      const selectInsertMock = vi.fn().mockReturnValue({ single: singleInsertMock })
      const insertMock = vi.fn().mockReturnValue({ select: selectInsertMock })

      clienteMock.from.mockImplementation((tabla: string) => {
        if (tabla === 'propiedades') {
          return { select: selectPropMock }
        }
        if (tabla === 'pagos_posicionamiento') {
          return { insert: insertMock }
        }
        return {}
      })

      const ahora = new Date()
      const fin = new Date(ahora.getTime() + 5 * 24 * 3600 * 1000)

      const res = await registrarPagoPosicionamiento(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        {
          propiedad_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          monto: 120000,
          moneda: 'COP',
          fecha_inicio: ahora.toISOString(),
          fecha_fin: fin.toISOString(),
          referencia_externa: 'REF-BC-789',
        },
        'admin-001',
      )

      expect(res.ok).toBe(true)
      expect(res.pagoId).toBe('pago-999')
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          propiedad_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          vendedor_id: 'vend-001',
          monto: 120000,
          estado: 'activo',
          registrado_por: 'admin-001',
          referencia_externa: 'REF-BC-789',
        }),
      )

      expect(adminMock.rpc).toHaveBeenCalledWith('registrar_evento_auditoria', {
        p_accion: 'posicionamiento_activado',
        p_entidad: 'pagos_posicionamiento',
        p_entidad_id: 'pago-999',
        p_actor_id: 'admin-001',
        p_metadatos: expect.objectContaining({
          propiedad_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          vendedor_id: 'vend-001',
          monto: 120000,
        }),
        p_ip: null,
      })
    })
  })

  describe('cancelarPagoPosicionamiento', () => {
    it('cancela el acuerdo y emite auditoría posicionamiento_cancelado', async () => {
      const singlePagoMock = vi.fn().mockResolvedValue({
        data: { id: 'pago-999', propiedad_id: 'prop-123', estado: 'activo' },
        error: null,
      })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singlePagoMock })
      const selectPagoMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      const eqUpdateMock = vi.fn().mockResolvedValue({ error: null })
      const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

      clienteMock.from.mockReturnValue({
        select: selectPagoMock,
        update: updateMock,
      })

      const res = await cancelarPagoPosicionamiento(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        'pago-999',
        'Vendedor solicitó devolución anticipada',
        'admin-001',
      )

      expect(res.ok).toBe(true)
      expect(updateMock).toHaveBeenCalledWith({ estado: 'cancelado' })
      expect(eqUpdateMock).toHaveBeenCalledWith('id', 'pago-999')
      expect(adminMock.rpc).toHaveBeenCalledWith('registrar_evento_auditoria', {
        p_accion: 'posicionamiento_cancelado',
        p_entidad: 'pagos_posicionamiento',
        p_entidad_id: 'pago-999',
        p_actor_id: 'admin-001',
        p_metadatos: {
          propiedad_id: 'prop-123',
          estado_anterior: 'activo',
          motivo: 'Vendedor solicitó devolución anticipada',
        },
        p_ip: null,
      })
    })
  })
})
