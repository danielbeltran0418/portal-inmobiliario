import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

const mockAdminFrom = vi.fn()
const mockAdminRpc = vi.fn()

vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => ({
    from: mockAdminFrom,
    rpc: mockAdminRpc,
  }),
}))

const { DrawerConversacionIA } = await import('@/components/panel/drawer-conversacion-ia')
const { BotonConfirmarPropuesta } = await import('@/components/panel/boton-confirmar-propuesta')
const { ToggleAutoConfirmar } = await import('@/components/panel/toggle-auto-confirmar')
const {
  aprobarCitaPropuesta,
  actualizarAutoConfirmacion,
} = await import('@/app/(vendedor)/panel/leads/acciones-ia')

describe('Componentes del Panel de Vendedor IA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('DrawerConversacionIA', () => {
    it('1. renderiza el boton de ver conversacion con numero de turnos', () => {
      const mensajes = [
        { id: '1', emisor: 'comprador', contenido: 'Hola me interesa', creado_en: new Date().toISOString() },
        { id: '2', emisor: 'agente_ia', contenido: 'Hola, con gusto te ayudo', creado_en: new Date().toISOString() },
      ]
      const markup = renderToStaticMarkup(
        createElement(DrawerConversacionIA, {
          mensajes,
          tituloPropiedad: 'Apartamento Chapinero',
          nombreComprador: 'Carlos Pérez',
        }),
      )
      expect(markup).toContain('Ver conversación con IA')
      expect(markup).toContain('2 turnos')
      expect(markup).toContain('data-testid="drawer-conversacion-ia"')
    })

    it('2. no renderiza nada si no hay mensajes', () => {
      const markup = renderToStaticMarkup(
        createElement(DrawerConversacionIA, { mensajes: [] }),
      )
      expect(markup).toBe('')
    })
  })

  describe('BotonConfirmarPropuesta', () => {
    it('3. renderiza el boton de confirmacion en 1 clic accesible', () => {
      const markup = renderToStaticMarkup(
        createElement(BotonConfirmarPropuesta, { conversacionId: 'conv-123' }),
      )
      expect(markup).toContain('data-testid="boton-confirmar-propuesta"')
      expect(markup).toContain('Aprobar visita en 1 clic')
    })
  })

  describe('ToggleAutoConfirmar', () => {
    it('4. refleja fielmente el estado inicial del switch', () => {
      const markupActivo = renderToStaticMarkup(
        createElement(ToggleAutoConfirmar, { inicial: true }),
      )
      expect(markupActivo).toContain('checked=""')
      expect(markupActivo).toContain('Permitir auto-confirmar citas con IA')

      const markupInactivo = renderToStaticMarkup(
        createElement(ToggleAutoConfirmar, { inicial: false }),
      )
      expect(markupInactivo).not.toContain('checked=""')
    })
  })

  describe('Acciones IA Vendedor', () => {
    it('5. aprobarCitaPropuesta invoca reservar_cita_como y marca cita_confirmada', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'vendedor-1' } } })

      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'conv-1',
                  lead_id: 'lead-1',
                  comprador_id: 'comp-1',
                  vendedor_id: 'vendedor-1',
                  franja_propuesta: '2026-09-20T14:00:00.000Z',
                  estado_conversacion: 'cita_propuesta',
                },
                error: null,
              }),
            }),
          }),
        }),
      })

      mockAdminRpc.mockResolvedValue({ data: 'cita-uuid-1', error: null })
      mockAdminFrom.mockReturnValue({
        update: () => ({
          eq: async () => ({ data: null, error: null }),
        }),
      })

      const res = await aprobarCitaPropuesta('conv-1')
      expect(res.ok).toBe(true)
      expect(mockAdminRpc).toHaveBeenCalledWith('reservar_cita_como', {
        p_lead_id: 'lead-1',
        p_inicio: '2026-09-20T14:00:00.000Z',
        p_actor: 'comp-1',
      })
    })

    it('6. actualizarAutoConfirmacion actualiza disponibilidad_semanal', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'vendedor-1' } } })
      const mockUpdate = vi.fn().mockReturnValue({
        eq: async () => ({ data: null, error: null }),
      })
      mockFrom.mockReturnValue({ update: mockUpdate })

      const res = await actualizarAutoConfirmacion(true)
      expect(res.ok).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith({ auto_confirmar_citas: true })
    })
  })
})