vi.mock('server-only', () => ({}))
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const getUser = vi.fn()
let leadPrevio: { id: string } | null = null

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({
    rpc,
    auth: { getUser },
    from: (tabla: string) => {
      const cadena = {
        eq: () => cadena,
        maybeSingle: async () => ({
          data: tabla === 'leads' ? leadPrevio : { telefono: '3001234567' },
          error: null,
        }),
      }
      return { select: () => cadena }
    },
  }),
}))

const procesarLeadIndividual = vi.fn()
vi.mock('@/lib/ia/despachador', () => ({ procesarLeadIndividual }))

// redirect() de Next lanza para cortar la accion; aqui se imita igual.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) },
}))

const { iniciarChatAgendamiento } = await import('@/app/[barrio]/[slug]/acciones')
const { MENSAJE_LEAD_PROPIA } = await import('@/lib/errores/mapear')

function formulario(): FormData {
  const fd = new FormData()
  fd.append('propiedad_id', 'prop-1')
  fd.append('ruta_ficha', '/prado/casa-a123')
  return fd
}

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'comprador-1' } } })
  procesarLeadIndividual.mockReset().mockResolvedValue(null)
  leadPrevio = null
})

describe('iniciarChatAgendamiento', () => {
  it('sin sesion lleva al login y vuelve a la ficha', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(iniciarChatAgendamiento({}, formulario()))
      .rejects.toThrow(`REDIRECT:/login?volver=${encodeURIComponent('/prado/casa-a123')}`)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sin contacto previo crea el lead, abre la conversacion y lleva al chat', async () => {
    rpc.mockResolvedValue({ data: 'lead-nuevo', error: null })
    await expect(iniciarChatAgendamiento({}, formulario())).rejects.toThrow('REDIRECT:/mi-cuenta/chat/lead-nuevo')
    expect(rpc).toHaveBeenCalledWith('crear_lead', expect.objectContaining({
      p_propiedad_id: 'prop-1', p_telefono: '3001234567',
    }))
    expect(procesarLeadIndividual).toHaveBeenCalledWith('lead-nuevo')
  })

  it('con contacto previo no crea otro lead: va directo a su chat', async () => {
    leadPrevio = { id: 'lead-viejo' }
    await expect(iniciarChatAgendamiento({}, formulario())).rejects.toThrow('REDIRECT:/mi-cuenta/chat/lead-viejo')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('en su propia propiedad devuelve el mensaje, sin redirigir', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'LD003' } })
    expect(await iniciarChatAgendamiento({}, formulario())).toEqual({ error: MENSAJE_LEAD_PROPIA })
    expect(procesarLeadIndividual).not.toHaveBeenCalled()
  })

  it('si el asistente falla igual lleva al chat: la pagina lo explica', async () => {
    rpc.mockResolvedValue({ data: 'lead-nuevo', error: null })
    procesarLeadIndividual.mockRejectedValue(new Error('sin clave de IA'))
    await expect(iniciarChatAgendamiento({}, formulario())).rejects.toThrow('REDIRECT:/mi-cuenta/chat/lead-nuevo')
  })
})
