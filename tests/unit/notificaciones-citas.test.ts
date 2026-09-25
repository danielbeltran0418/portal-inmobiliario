import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

const enviar = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: enviar }
  },
}))

const VENDEDOR = 'vendedor-1'
const COMPRADOR = 'comprador-1'
const correos: Record<string, string> = { [VENDEDOR]: 'dueno@x.co', [COMPRADOR]: 'compra@x.co' }

vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => ({
    from: (tabla: string) => {
      if (tabla === 'citas') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'cita-1',
                  rango: '["2026-10-01 20:00:00+00","2026-10-01 21:00:00+00")',
                  comprador_id: COMPRADOR,
                  vendedor_id: VENDEDOR,
                  propiedades: { titulo: 'Casa en Riomar' },
                },
                error: null,
              }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          in: async () => ({
            data: [{ id: VENDEDOR, nombre: 'Ana Duena' }, { id: COMPRADOR, nombre: 'Luis Comprador' }],
          }),
        }),
      }
    },
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: correos[id] } } }) } },
  }),
}))

const { avisarCita, armarCorreoCita, destinatarioDe } = await import('@/lib/notificaciones/citas')

describe('destinatarioDe', () => {
  const cita = { comprador_id: COMPRADOR, vendedor_id: VENDEDOR }
  it('avisa siempre a la otra parte de quien hizo el cambio', () => {
    expect(destinatarioDe(COMPRADOR, cita)).toBe('vendedor')
    expect(destinatarioDe(VENDEDOR, cita)).toBe('comprador')
  })
})

describe('armarCorreoCita', () => {
  it('pone la hora de Bogota, no la UTC', () => {
    const c = armarCorreoCita({
      evento: 'reservada', para: 'a@x.co', nombreDestinatario: 'Ana', nombreOtraParte: 'Luis',
      titulo: 'Casa', inicio: '2026-10-01T20:00:00.000Z',
    })
    expect(c.asunto).toBe('Nueva visita agendada: Casa')
    expect(c.texto).toContain('Luis agendó una visita a "Casa"')
    // 20:00 UTC son las 3 de la tarde en Bogota.
    expect(c.texto).toMatch(/3:00/)
    expect(c.texto).toContain('8 horas')
  })

  it('escapa el HTML de los datos que escribe el usuario', () => {
    const c = armarCorreoCita({
      evento: 'cancelada', para: 'a@x.co', nombreDestinatario: '<b>Ana</b>', nombreOtraParte: 'Luis',
      titulo: '<script>x</script>', inicio: '2026-10-01T20:00:00.000Z',
    })
    expect(c.html).not.toContain('<script>')
    expect(c.html).toContain('&lt;script&gt;')
  })
})

describe('avisarCita', () => {
  beforeEach(() => {
    enviar.mockReset().mockResolvedValue({ error: null })
    vi.stubEnv('RESEND_API_KEY', 're_prueba')
    vi.stubEnv('RESEND_FROM', 'Portal <avisos@x.co>')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('una reserva del comprador le llega al propietario', async () => {
    await avisarCita('cita-1', 'reservada', COMPRADOR)
    expect(enviar).toHaveBeenCalledOnce()
    const envio = enviar.mock.calls[0]![0]
    expect(envio.to).toEqual(['dueno@x.co'])
    expect(envio.text).toContain('Hola, Ana Duena')
    expect(envio.text).toContain('Luis Comprador agendó una visita a "Casa en Riomar"')
  })

  it('si cancela el vendedor, le llega al comprador', async () => {
    await avisarCita('cita-1', 'cancelada', VENDEDOR)
    expect(enviar.mock.calls[0]![0].to).toEqual(['compra@x.co'])
  })

  it('sin configuracion de Resend no envia ni lanza', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    await expect(avisarCita('cita-1', 'reservada', COMPRADOR)).resolves.toBeUndefined()
    expect(enviar).not.toHaveBeenCalled()
  })

  it('un fallo de Resend no se propaga: la visita ya quedo hecha', async () => {
    enviar.mockResolvedValue({ error: { message: 'dominio no verificado' } })
    await expect(avisarCita('cita-1', 'reservada', COMPRADOR)).resolves.toBeUndefined()
  })
})
