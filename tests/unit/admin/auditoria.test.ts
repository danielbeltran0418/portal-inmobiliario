import { describe, it, expect, vi } from 'vitest'
import { consultarEventosAuditoria } from '@/lib/admin/auditoria'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('Consultas y Filtrado de Auditoría (SP7)', () => {
  it('aplica paginación por defecto y ordenación descendente', async () => {
    const rangeMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          accion: 'propiedad_moderada',
          entidad: 'propiedades',
          entidad_id: 'prop-1',
          actor_id: 'admin-1',
          creado_en: '2026-09-16T00:00:00Z',
          metadatos: {},
        },
      ],
      count: 45,
      error: null,
    })

    const orderMock = vi.fn().mockReturnValue({ range: rangeMock })
    const selectMock = vi.fn().mockReturnValue({ order: orderMock })
    const fromMock = vi.fn().mockReturnValue({ select: selectMock })

    const clienteMock = { from: fromMock }

    const resultado = await consultarEventosAuditoria(clienteMock as unknown as SupabaseClient)

    expect(fromMock).toHaveBeenCalledWith('registro_auditoria')
    expect(orderMock).toHaveBeenCalledWith('creado_en', { ascending: false })
    // Pagina 1 por defecto con 20 elementos: range(0, 19)
    expect(rangeMock).toHaveBeenCalledWith(0, 19)
    expect(resultado.total).toBe(45)
    expect(resultado.pagina).toBe(1)
    expect(resultado.totalPaginas).toBe(3)
    expect(resultado.eventos).toHaveLength(1)
  })

  it('aplica filtros de acción, entidad, actor y fechas correctamente', async () => {
    const rangeMock = vi.fn().mockResolvedValue({
      data: [],
      count: 0,
      error: null,
    })
    const orderMock = vi.fn().mockReturnValue({ range: rangeMock })
    const lteMock = vi.fn().mockReturnValue({ order: orderMock })
    const gteMock = vi.fn().mockReturnValue({ lte: lteMock })
    const eqActorMock = vi.fn().mockReturnValue({ gte: gteMock })
    const eqEntidadMock = vi.fn().mockReturnValue({ eq: eqActorMock })
    const eqAccionMock = vi.fn().mockReturnValue({ eq: eqEntidadMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqAccionMock })
    const fromMock = vi.fn().mockReturnValue({ select: selectMock })

    const clienteMock = { from: fromMock }

    await consultarEventosAuditoria(
      clienteMock as unknown as SupabaseClient,
      {
        accion: 'propiedad_moderada',
        entidad: 'propiedades',
        actor_id: 'admin-99',
        desde: '2026-09-01T00:00:00Z',
        hasta: '2026-09-15T23:59:59Z',
      },
      { pagina: 2, porPagina: 10 },
    )

    expect(eqAccionMock).toHaveBeenCalledWith('accion', 'propiedad_moderada')
    expect(eqEntidadMock).toHaveBeenCalledWith('entidad', 'propiedades')
    expect(eqActorMock).toHaveBeenCalledWith('actor_id', 'admin-99')
    expect(gteMock).toHaveBeenCalledWith('creado_en', '2026-09-01T00:00:00Z')
    expect(lteMock).toHaveBeenCalledWith('creado_en', '2026-09-15T23:59:59Z')
    // Pagina 2 con 10 elementos: range(10, 19)
    expect(rangeMock).toHaveBeenCalledWith(10, 19)
  })

  it('maneja errores de la base retornando estructura vacía segura', async () => {
    const rangeMock = vi.fn().mockResolvedValue({
      data: null,
      count: null,
      error: { message: 'DB timeout' },
    })
    const orderMock = vi.fn().mockReturnValue({ range: rangeMock })
    const selectMock = vi.fn().mockReturnValue({ order: orderMock })
    const fromMock = vi.fn().mockReturnValue({ select: selectMock })

    const clienteMock = { from: fromMock }

    const resultado = await consultarEventosAuditoria(clienteMock as unknown as SupabaseClient)

    expect(resultado.eventos).toEqual([])
    expect(resultado.total).toBe(0)
    expect(resultado.totalPaginas).toBe(0)
  })
})
