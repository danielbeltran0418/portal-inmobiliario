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

const PROP_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const ADMIN_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'

describe('Servicios de Moderación Administrativa (SP7 / CN-009)', () => {
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
    it('falla si el ID de propiedad no es UUID válido', async () => {
      const res = await suspenderPropiedad(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        'prop-invalido',
        'Motivo válido',
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toBe('ID de propiedad inválido.')
    })

    it('falla si el motivo está vacío o solo contiene espacios', async () => {
      const res = await suspenderPropiedad(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        PROP_ID,
        '   ',
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toContain('Se requiere un motivo')
    })

    it('falla si el motivo supera 500 caracteres', async () => {
      const res = await suspenderPropiedad(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        PROP_ID,
        'x'.repeat(501),
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toContain('no puede superar 500 caracteres')
    })

    it('devuelve error si la propiedad no existe', async () => {
      const singleMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singleMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      clienteMock.from.mockReturnValue({ select: selectMock })

      const res = await suspenderPropiedad(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        PROP_ID,
        'Motivo cualquiera',
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toBeDefined()
    })

    it('falla si el update afecta a 0 filas', async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: PROP_ID, estado: 'publicada' },
        error: null,
      })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singleMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      const selectUpdateMock = vi.fn().mockResolvedValue({ data: [], error: null })
      const eqUpdateMock = vi.fn().mockReturnValue({ select: selectUpdateMock })
      const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

      clienteMock.from.mockImplementation((tabla: string) => {
        if (tabla === 'propiedades') {
          return { select: selectMock, update: updateMock }
        }
        return {}
      })

      const res = await suspenderPropiedad(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        PROP_ID,
        'Fotos engañosas',
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toBe('No se pudo suspender la propiedad.')
    })

    it('falla si la RPC de auditoría falla', async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: PROP_ID, estado: 'publicada' },
        error: null,
      })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singleMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      const selectUpdateMock = vi.fn().mockResolvedValue({ data: [{ id: PROP_ID }], error: null })
      const eqUpdateMock = vi.fn().mockReturnValue({ select: selectUpdateMock })
      const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

      clienteMock.from.mockImplementation((tabla: string) => {
        if (tabla === 'propiedades') {
          return { select: selectMock, update: updateMock }
        }
        return {}
      })

      adminMock.rpc.mockResolvedValue({ data: null, error: { message: 'Fallo auditoria' } })

      const res = await suspenderPropiedad(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        PROP_ID,
        'Fotos engañosas',
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toBeDefined()
    })

    it('suspende la propiedad a estado "rechazada", encadena .select("id") y emite auditoría', async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: PROP_ID, estado: 'publicada' },
        error: null,
      })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singleMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      const selectUpdateMock = vi.fn().mockResolvedValue({ data: [{ id: PROP_ID }], error: null })
      const eqUpdateMock = vi.fn().mockReturnValue({ select: selectUpdateMock })
      const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

      clienteMock.from.mockImplementation((tabla: string) => {
        if (tabla === 'propiedades') {
          return { select: selectMock, update: updateMock }
        }
        return {}
      })

      const res = await suspenderPropiedad(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        PROP_ID,
        'Fotos engañosas y precio alterado',
        ADMIN_ID,
      )

      expect(res.ok).toBe(true)
      expect(res.propiedadId).toBe(PROP_ID)
      expect(updateMock).toHaveBeenCalledWith({ estado: 'rechazada' })
      expect(eqUpdateMock).toHaveBeenCalledWith('id', PROP_ID)

      expect(adminMock.rpc).toHaveBeenCalledWith('registrar_evento_auditoria', {
        p_accion: 'propiedad_moderada',
        p_entidad: 'propiedades',
        p_entidad_id: PROP_ID,
        p_actor_id: ADMIN_ID,
        p_metadatos: {
          accion_especifica: 'suspender',
          estado_anterior: 'publicada',
          estado_nuevo: 'rechazada',
          motivo: 'Fotos engañosas y precio alterado',
        },
        p_ip: null,
      })
    })
  })

  describe('reactivarPropiedad', () => {
    it('falla si el ID de propiedad no es UUID válido', async () => {
      const res = await reactivarPropiedad(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        'id-invalido',
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toBe('ID de propiedad inválido.')
    })

    it('actualiza estado a "publicada", encadena .select("id") y registra evento de auditoría', async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: PROP_ID, estado: 'rechazada' },
        error: null,
      })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singleMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      const selectUpdateMock = vi.fn().mockResolvedValue({ data: [{ id: PROP_ID }], error: null })
      const eqUpdateMock = vi.fn().mockReturnValue({ select: selectUpdateMock })
      const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

      clienteMock.from.mockImplementation((tabla: string) => {
        if (tabla === 'propiedades') {
          return { select: selectMock, update: updateMock }
        }
        return {}
      })

      const res = await reactivarPropiedad(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        PROP_ID,
        ADMIN_ID,
      )

      expect(res.ok).toBe(true)
      expect(updateMock).toHaveBeenCalledWith({ estado: 'publicada' })
      expect(adminMock.rpc).toHaveBeenCalledWith('registrar_evento_auditoria', {
        p_accion: 'propiedad_moderada',
        p_entidad: 'propiedades',
        p_entidad_id: PROP_ID,
        p_actor_id: ADMIN_ID,
        p_metadatos: {
          accion_especifica: 'reactivar',
          estado_anterior: 'rechazada',
          estado_nuevo: 'publicada',
        },
        p_ip: null,
      })
    })

    it('falla si el update afecta a 0 filas', async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: PROP_ID, estado: 'rechazada' },
        error: null,
      })
      const eqSelectMock = vi.fn().mockReturnValue({ single: singleMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock })

      const selectUpdateMock = vi.fn().mockResolvedValue({ data: [], error: null })
      const eqUpdateMock = vi.fn().mockReturnValue({ select: selectUpdateMock })
      const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

      clienteMock.from.mockImplementation((tabla: string) => {
        if (tabla === 'propiedades') {
          return { select: selectMock, update: updateMock }
        }
        return {}
      })

      const res = await reactivarPropiedad(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        PROP_ID,
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toBe('No se pudo reactivar la propiedad.')
    })
  })

  describe('eliminarPropiedadAdmin', () => {
    it('falla si el ID de propiedad no es UUID válido', async () => {
      const res = await eliminarPropiedadAdmin(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        'id-invalido',
        'Motivo válido',
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toBe('ID de propiedad inválido.')
    })

    it('exige motivo válido y elimina la propiedad con .select("id") registrando auditoría previa', async () => {
      const selectDeleteMock = vi.fn().mockResolvedValue({ data: [{ id: PROP_ID }], error: null })
      const eqDeleteMock = vi.fn().mockReturnValue({ select: selectDeleteMock })
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
        PROP_ID,
        'Inmueble duplicado y fraudulento',
        ADMIN_ID,
      )

      expect(res.ok).toBe(true)
      expect(adminMock.rpc).toHaveBeenCalledWith('registrar_evento_auditoria', {
        p_accion: 'propiedad_moderada',
        p_entidad: 'propiedades',
        p_entidad_id: PROP_ID,
        p_actor_id: ADMIN_ID,
        p_metadatos: {
          accion_especifica: 'eliminar',
          motivo: 'Inmueble duplicado y fraudulento',
        },
        p_ip: null,
      })
      expect(deleteMock).toHaveBeenCalled()
      expect(eqDeleteMock).toHaveBeenCalledWith('id', PROP_ID)
    })

    it('falla si el delete afecta 0 filas', async () => {
      const selectDeleteMock = vi.fn().mockResolvedValue({ data: [], error: null })
      const eqDeleteMock = vi.fn().mockReturnValue({ select: selectDeleteMock })
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
        PROP_ID,
        'Inmueble duplicado',
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(res.error).toBe('No se pudo eliminar la propiedad.')
    })

    it('falla si la auditoría previa falla antes de eliminar', async () => {
      adminMock.rpc.mockResolvedValue({ data: null, error: { message: 'Auditoria fallo' } })

      const deleteMock = vi.fn()
      clienteMock.from.mockReturnValue({ delete: deleteMock })

      const res = await eliminarPropiedadAdmin(
        clienteMock as unknown as SupabaseClient,
        adminMock as unknown as SupabaseClient,
        PROP_ID,
        'Inmueble duplicado',
        ADMIN_ID,
      )

      expect(res.ok).toBe(false)
      expect(deleteMock).not.toHaveBeenCalled()
    })
  })
})
