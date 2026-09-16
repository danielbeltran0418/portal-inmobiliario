import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  suspenderPropiedad,
  reactivarPropiedad,
  eliminarPropiedadAdmin,
} from '@/lib/admin/moderacion'
import type { SupabaseClient } from '@supabase/supabase-js'

interface ClienteMock {
  from: ReturnType<typeof vi.fn>
}

interface AdminMock {
  rpc: ReturnType<typeof vi.fn>
}

describe('Servicios de Moderación Administrativa (SP7)', () => {
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

  describe('suspenderPropiedad', () => {
    it('falla si el motivo está vacío o solo contiene espacios', async () => {
      const res = await suspenderPropiedad(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        'prop-123',
        '   ',
        'admin-001',
      )

      expect(res.ok).toBe(false)
      expect(res.error).toContain('motivo de suspensión')
    })

    it('suspende la propiedad a estado "rechazada" y emite auditoría', async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: 'prop-123', estado: 'publicada' },
        error: null,
      })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singleMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      const eqUpdateMock = vi.fn().mockResolvedValue({ error: null })
      const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

      clienteMock.from.mockImplementation((tabla: string) => {
        if (tabla === 'propiedades') {
          return {
            select: selectMock,
            update: updateMock,
          }
        }
        return {}
      })

      const res = await suspenderPropiedad(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        'prop-123',
        'Fotos engañosas y precio alterado',
        'admin-001',
      )

      expect(res.ok).toBe(true)
      expect(res.propiedadId).toBe('prop-123')
      expect(updateMock).toHaveBeenCalledWith({ estado: 'rechazada' })
      expect(eqUpdateMock).toHaveBeenCalledWith('id', 'prop-123')

      expect(adminMock.rpc).toHaveBeenCalledWith('registrar_evento_auditoria', {
        p_accion: 'propiedad_moderada',
        p_entidad: 'propiedades',
        p_entidad_id: 'prop-123',
        p_actor_id: 'admin-001',
        p_metadatos: {
          accion_especifica: 'suspender',
          estado_anterior: 'publicada',
          estado_nuevo: 'rechazada',
          motivo: 'Fotos engañosas y precio alterado',
        },
        p_ip: null,
      })
    })

    it('devuelve error si la propiedad no existe', async () => {
      const singleMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singleMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      clienteMock.from.mockReturnValue({ select: selectMock })

      const res = await suspenderPropiedad(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        'prop-inexistente',
        'Motivo cualquiera',
        'admin-001',
      )

      expect(res.ok).toBe(false)
      expect(res.error).toContain('no encontrada')
    })
  })

  describe('reactivarPropiedad', () => {
    it('actualiza estado a "publicada" y registra evento de auditoría', async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: 'prop-123', estado: 'rechazada' },
        error: null,
      })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singleMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      const eqUpdateMock = vi.fn().mockResolvedValue({ error: null })
      const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

      clienteMock.from.mockImplementation((tabla: string) => {
        if (tabla === 'propiedades') {
          return {
            select: selectMock,
            update: updateMock,
          }
        }
        return {}
      })

      const res = await reactivarPropiedad(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        'prop-123',
        'admin-001',
      )

      expect(res.ok).toBe(true)
      expect(updateMock).toHaveBeenCalledWith({ estado: 'publicada' })
      expect(adminMock.rpc).toHaveBeenCalledWith('registrar_evento_auditoria', {
        p_accion: 'propiedad_moderada',
        p_entidad: 'propiedades',
        p_entidad_id: 'prop-123',
        p_actor_id: 'admin-001',
        p_metadatos: {
          accion_especifica: 'reactivar',
          estado_anterior: 'rechazada',
          estado_nuevo: 'publicada',
        },
        p_ip: null,
      })
    })
  })

  describe('eliminarPropiedadAdmin', () => {
    it('exige motivo y elimina la propiedad registrando auditoría previa', async () => {
      const eqDeleteMock = vi.fn().mockResolvedValue({ error: null })
      const deleteMock = vi.fn().mockReturnValue({ eq: eqDeleteMock })

      clienteMock.from.mockImplementation((tabla: string) => {
        if (tabla === 'propiedades') {
          return { delete: deleteMock }
        }
        return {}
      })

      const res = await eliminarPropiedadAdmin(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        'prop-delete',
        'Inmueble duplicado y fraudulento',
        'admin-001',
      )

      expect(res.ok).toBe(true)
      expect(adminMock.rpc).toHaveBeenCalledWith('registrar_evento_auditoria', {
        p_accion: 'propiedad_moderada',
        p_entidad: 'propiedades',
        p_entidad_id: 'prop-delete',
        p_actor_id: 'admin-001',
        p_metadatos: {
          accion_especifica: 'eliminar',
          motivo: 'Inmueble duplicado y fraudulento',
        },
        p_ip: null,
      })
      expect(deleteMock).toHaveBeenCalled()
      expect(eqDeleteMock).toHaveBeenCalledWith('id', 'prop-delete')
    })
  })
})
