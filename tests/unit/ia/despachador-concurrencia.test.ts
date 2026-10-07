import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const rpc = vi.fn()
const insertados: { tabla: string; fila: Record<string, unknown> }[] = []
const ejecutarInferenciaIA = vi.fn()

const LEAD = {
  id: 'lead-4', propiedad_id: 'p1', comprador_id: 'c1', vendedor_id: 'v1', mensaje: 'Hola', estado: 'nuevo',
  propiedades: { titulo: 'Casa', tipo_inmueble: 'casa', operacion: 'venta', precio: 1, moneda: 'COP', barrio: { nombre: 'El Prado', ciudad: 'Barranquilla' } },
}

vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => ({
    rpc,
    from: (tabla: string) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.maybeSingle = async () => ({ data: null, error: null })
      q.single = async () => (tabla === 'leads' ? { data: LEAD, error: null } : { data: { id: 'conv-4' }, error: null })
      q.insert = (fila: Record<string, unknown>) => {
        insertados.push({ tabla, fila })
        return Object.assign(Promise.resolve({ error: null }), { select: () => q })
      }
      return q
    },
  }),
}))
vi.mock('@/lib/ia/cliente', () => ({ ejecutarInferenciaIA }))

const { procesarLeadIndividual } = await import('@/lib/ia/despachador')
const { MENSAJE_CONCURRENCIA } = await import('@/lib/ia/limites')

describe('despachador y limite de 3 conversaciones activas', () => {
  beforeEach(() => {
    rpc.mockReset()
    insertados.length = 0
    ejecutarInferenciaIA.mockReset().mockResolvedValue({
      texto: 'Hola, con gusto.', tool_calls: [], tokens: { prompt_tokens: 10, completion_tokens: 5 }, modeloUtilizado: 'm',
    })
  })

  it('la cuarta conversacion se crea pero no paga inferencia: deja el aviso del asistente', async () => {
    rpc.mockImplementation(async (nombre: string) => ({ data: nombre === 'conversacion_excede_concurrencia', error: null }))
    const r = await procesarLeadIndividual('lead-4')
    expect(rpc).toHaveBeenCalledWith('conversacion_excede_concurrencia', { p_conversacion_id: 'conv-4' })
    expect(ejecutarInferenciaIA).not.toHaveBeenCalled()
    const mensajes = insertados.filter((i) => i.tabla === 'mensajes_ia').map((i) => i.fila)
    expect(mensajes.map((m) => m.emisor)).toEqual(['comprador', 'agente_ia'])
    expect(mensajes[1]).toMatchObject({ contenido: MENSAJE_CONCURRENCIA, tokens_entrada: 0, tokens_salida: 0 })
    expect(r).toEqual({ conversacionId: 'conv-4', respuestaAgente: MENSAJE_CONCURRENCIA })
  })

  it('dentro del limite sigue con la inferencia normal', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    await procesarLeadIndividual('lead-4')
    expect(ejecutarInferenciaIA).toHaveBeenCalledTimes(1)
  })
})
