import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const rpc = vi.fn()
vi.mock('@/lib/supabase/cliente-admin', () => ({ crearClienteAdmin: () => ({ rpc }) }))

const { registrarMensajeComprador, ErrorLimiteAbuso } = await import('@/lib/ia/limites')

describe('registrarMensajeComprador (CN-013)', () => {
  beforeEach(() => rpc.mockReset())

  it('llama a la funcion atomica con la conversacion, el comprador y el texto', async () => {
    rpc.mockResolvedValue({ data: 'ok', error: null })
    await registrarMensajeComprador('c1', 'u1', 'hola')
    expect(rpc).toHaveBeenCalledWith('registrar_mensaje_comprador_ia', {
      p_conversacion_id: 'c1', p_comprador_id: 'u1', p_contenido: 'hola',
    })
  })

  it.each([
    ['cerrada', 'IA_TOPE_TURNOS', 400],
    ['tope_turnos', 'IA_TOPE_TURNOS', 400],
    ['tope_tokens', 'IA_TOPE_TOKENS', 400],
    ['rate_limit', 'IA_RATE_LIMIT', 429],
    ['concurrencia', 'IA_CONCURRENCIA', 429],
  ])('%s se traduce a %s (%i)', async (resultado, codigo, status) => {
    rpc.mockResolvedValue({ data: resultado, error: null })
    const err = await registrarMensajeComprador('c1', 'u1', 'hola').catch((e) => e)
    expect(err).toBeInstanceOf(ErrorLimiteAbuso)
    expect(err.codigo).toBe(codigo)
    expect(err.status).toBe(status)
  })

  it('un fallo de la base no se confunde con un limite', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'caida' } })
    const err = await registrarMensajeComprador('c1', 'u1', 'hola').catch((e) => e)
    expect(err).not.toBeInstanceOf(ErrorLimiteAbuso)
  })
})
