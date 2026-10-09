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

const PROP_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const ADMIN_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
const PAGO_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'

describe('Servicios y Esquemas de Posicionamiento Pagado (SP7 / CN-009)', () => {
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
        propiedad_id: PROP_ID,
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
        propiedad_id: PROP_ID,
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
        propiedad_id: PROP_ID,
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
    it('falla si el adminId no es UUID válido', async () => {
      const ahora = new Date()
      const fin = new Date(ahora.getTime() + 5 * 24 * 3600 * 1000)

      const res = await registrarPagoPosicionamiento(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        {
          propiedad_id: PROP_ID,
          monto: 80000,
          fecha_inicio: ahora.toISOString(),
          fecha_fin: fin.toISOString(),
        },
        'admin-invalido',
      )

      expect(res.ok).toBe(false)
      expect(res.error).toBe('ID de administrador inválido.')
    })

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
          propiedad_id: PROP_ID,
          monto: 80000,
          fecha_inicio: ahora.toISOString(),
          fecha_fin: fin.toISOString(),
        },
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toContain('Propiedad no encontrada')
    })

    it('registra exitosamente el pago y emite auditoría posicionamiento_activado', async () => {
      const singlePropMock = vi.fn().mockResolvedValue({
        data: { id: PROP_ID, vendedor_id: 'vend-001', estado: 'publicada' },
        error: null,
      })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singlePropMock })
      const selectPropMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      const singleInsertMock = vi.fn().mockResolvedValue({
        data: { id: PAGO_ID },
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
          propiedad_id: PROP_ID,
          monto: 120000,
          moneda: 'COP',
          fecha_inicio: ahora.toISOString(),
          fecha_fin: fin.toISOString(),
          referencia_externa: 'REF-BC-789',
        },
        ADMIN_ID,
      )

      expect(res.ok).toBe(true)
      expect(res.pagoId).toBe(PAGO_ID)
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          propiedad_id: PROP_ID,
          vendedor_id: 'vend-001',
          monto: 120000,
          estado: 'activo',
          registrado_por: ADMIN_ID,
          referencia_externa: 'REF-BC-789',
        }),
      )

      expect(adminMock.rpc).toHaveBeenCalledWith('registrar_evento_auditoria', {
        p_accion: 'posicionamiento_activado',
        p_entidad: 'pagos_posicionamiento',
        p_entidad_id: PAGO_ID,
        p_actor_id: ADMIN_ID,
        p_metadatos: expect.objectContaining({
          propiedad_id: PROP_ID,
          vendedor_id: 'vend-001',
          monto: 120000,
        }),
        p_ip: null,
      })
    })

    it('falla si la RPC de auditoría falla', async () => {
      const singlePropMock = vi.fn().mockResolvedValue({
        data: { id: PROP_ID, vendedor_id: 'vend-001', estado: 'publicada' },
        error: null,
      })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singlePropMock })
      const selectPropMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      const singleInsertMock = vi.fn().mockResolvedValue({
        data: { id: PAGO_ID },
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

      adminMock.rpc.mockResolvedValue({ data: null, error: { message: 'Auditoria fallo' } })

      const ahora = new Date()
      const fin = new Date(ahora.getTime() + 5 * 24 * 3600 * 1000)

      const res = await registrarPagoPosicionamiento(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        {
          propiedad_id: PROP_ID,
          monto: 120000,
          moneda: 'COP',
          fecha_inicio: ahora.toISOString(),
          fecha_fin: fin.toISOString(),
        },
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toBeDefined()
    })
  })

  describe('cancelarPagoPosicionamiento', () => {
    it('falla si el pagoId no es UUID válido', async () => {
      const res = await cancelarPagoPosicionamiento(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        'pago-invalido',
        'Motivo válido',
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toBe('ID del acuerdo inválido.')
    })

    it('falla si el motivo está vacío', async () => {
      const res = await cancelarPagoPosicionamiento(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        PAGO_ID,
        '   ',
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toContain('Se requiere un motivo')
    })

    it('cancela el acuerdo, encadena .select("id") y emite auditoría posicionamiento_cancelado', async () => {
      const singlePagoMock = vi.fn().mockResolvedValue({
        data: { id: PAGO_ID, propiedad_id: PROP_ID, estado: 'activo' },
        error: null,
      })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singlePagoMock })
      const selectPagoMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      const selectUpdateMock = vi.fn().mockResolvedValue({ data: [{ id: PAGO_ID }], error: null })
      const eqUpdateMock = vi.fn().mockReturnValue({ select: selectUpdateMock })
      const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

      clienteMock.from.mockReturnValue({
        select: selectPagoMock,
        update: updateMock,
      })

      const res = await cancelarPagoPosicionamiento(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        PAGO_ID,
        'Vendedor solicitó devolución anticipada',
        ADMIN_ID,
      )

      expect(res.ok).toBe(true)
      expect(updateMock).toHaveBeenCalledWith({ estado: 'cancelado' })
      expect(eqUpdateMock).toHaveBeenCalledWith('id', PAGO_ID)
      expect(adminMock.rpc).toHaveBeenCalledWith('registrar_evento_auditoria', {
        p_accion: 'posicionamiento_cancelado',
        p_entidad: 'pagos_posicionamiento',
        p_entidad_id: PAGO_ID,
        p_actor_id: ADMIN_ID,
        p_metadatos: {
          propiedad_id: PROP_ID,
          estado_anterior: 'activo',
          motivo: 'Vendedor solicitó devolución anticipada',
        },
        p_ip: null,
      })
    })

    it('falla si el update afecta a 0 filas', async () => {
      const singlePagoMock = vi.fn().mockResolvedValue({
        data: { id: PAGO_ID, propiedad_id: PROP_ID, estado: 'activo' },
        error: null,
      })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singlePagoMock })
      const selectPagoMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      const selectUpdateMock = vi.fn().mockResolvedValue({ data: [], error: null })
      const eqUpdateMock = vi.fn().mockReturnValue({ select: selectUpdateMock })
      const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

      clienteMock.from.mockReturnValue({
        select: selectPagoMock,
        update: updateMock,
      })

      const res = await cancelarPagoPosicionamiento(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        PAGO_ID,
        'Motivo válido',
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toBe('Acuerdo de posicionamiento no encontrado o ya cancelado.')
    })
  })
})
