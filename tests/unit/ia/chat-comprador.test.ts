import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockAdminFrom = vi.fn()
const mockVerificarLimites = vi.fn()

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => ({
    from: mockAdminFrom,
  }),
}))

vi.mock('@/lib/ia/limites', () => ({
  verificarLimitesConversacion: (...args: any[]) => mockVerificarLimites(...args),
}))

vi.mock('@/lib/ia/cliente', () => ({
  ejecutarInferenciaIA: vi.fn().mockResolvedValue({
    texto: 'Hola, con gusto te respondo.',
    tool_calls: [],
    tokens: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    modeloUtilizado: 'gpt-5.6-luna',
  }),
}))

const { ChatLeadIA } = await import('@/components/mi-cuenta/chat-lead-ia')
const { enviarMensajeComprador } = await import(
  '@/app/(comprador)/mi-cuenta/solicitudes/acciones-ia'
)

describe('Chat Interactivo del Comprador IA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Renderizado de Componente ChatLeadIA', () => {
    it('1. renderiza el boton de consulta y el conteo de mensajes', () => {
      const mensajes = [
        { id: '1', emisor: 'comprador', contenido: '¿Tiene balcón?', creado_en: new Date().toISOString() },
        { id: '2', emisor: 'agente_ia', contenido: 'Sí, tiene un balcón amplio con vista al parque.', creado_en: new Date().toISOString() },
      ]
      const markup = renderToStaticMarkup(
        createElement(ChatLeadIA, {
          conversacionId: 'conv-123',
          mensajesIniciales: mensajes,
        }),
      )
      expect(markup).toContain('data-testid="chat-lead-ia"')
      expect(markup).toContain('Consultar dudas con el asistente virtual')
      expect(markup).toContain('2 msgs')
    })
  })

  describe('Server Action enviarMensajeComprador', () => {
    it('2. bloquea el envio si la conversacion supero el limite de 10 turnos', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'comprador-1' } } })
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'conv-1', comprador_id: 'comprador-1', vendedor_id: 'vendedor-1' },
                error: null,
              }),
            }),
          }),
        }),
      })

      const errTope = new Error('Límite de 10 turnos excedido')
      ;(errTope as any).codigo = 'IA_TOPE_TURNOS'
      mockVerificarLimites.mockRejectedValue(errTope)

      const res = await enviarMensajeComprador('conv-1', '¿Sigue disponible?')
      expect(res.ok).toBe(false)
      expect(res.codigo).toBe('IA_TOPE_TURNOS')
      expect(res.error).toContain('límite')
    })

    it('3. maneja error 429 retornando mensaje de espera para el usuario', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'comprador-1' } } })
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'conv-1', comprador_id: 'comprador-1', vendedor_id: 'vendedor-1' },
                error: null,
              }),
            }),
          }),
        }),
      })

      const errRateLimit = new Error('Demasiadas peticiones')
      ;(errRateLimit as any).status = 429
      mockVerificarLimites.mockRejectedValue(errRateLimit)

      const res = await enviarMensajeComprador('conv-1', 'Hola')
      expect(res.ok).toBe(false)
      expect(res.status).toBe(429)
      expect(res.error).toBe('Por favor espera un momento antes de enviar otro mensaje.')
    })
  })
})
