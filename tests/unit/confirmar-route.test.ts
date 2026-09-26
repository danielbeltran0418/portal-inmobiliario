import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const verifyOtp = vi.fn()
const exchangeCodeForSession = vi.fn()

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ auth: { verifyOtp, exchangeCodeForSession } }),
}))

const { GET } = await import('@/app/confirmar/route')

function token(rol: string): string {
  const cuerpo = Buffer.from(JSON.stringify({ app_metadata: { rol } })).toString('base64url')
  return `x.${cuerpo}.y`
}

function sesion(rol: string) {
  return { data: { session: { access_token: token(rol) } }, error: null }
}

const SIN_SESION = { data: { session: null }, error: { code: 'otp_expired' } }

function pedir(query: string) {
  return GET(new NextRequest(`http://127.0.0.1:3000/confirmar${query}`))
}

describe('GET /confirmar', () => {
  beforeEach(() => {
    verifyOtp.mockReset()
    exchangeCodeForSession.mockReset()
  })

  it('con token_hash (plantilla propia) verifica y lleva al panel del rol', async () => {
    verifyOtp.mockResolvedValue(sesion('vendedor'))
    const res = await pedir('?token_hash=abc&type=email')
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'abc' })
    expect(res.headers.get('location')).toMatch(/\/panel$/)
  })

  it('acepta type=signup, que es el que emiten otras plantillas', async () => {
    verifyOtp.mockResolvedValue(sesion('comprador'))
    const res = await pedir('?token_hash=abc&type=signup')
    expect(res.headers.get('location')).toMatch(/\/mi-cuenta$/)
  })

  it('con code (plantilla por defecto del proyecto alojado) canjea el codigo', async () => {
    exchangeCodeForSession.mockResolvedValue(sesion('vendedor'))
    const res = await pedir('?code=pkce-123')
    expect(exchangeCodeForSession).toHaveBeenCalledWith('pkce-123')
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toMatch(/\/panel$/)
  })

  it('un type desconocido no llega a Supabase', async () => {
    const res = await pedir('?token_hash=abc&type=recovery')
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toMatch(/\/login\?verificacion=fallida$/)
  })

  it('sin parametros rebota al login', async () => {
    const res = await pedir('')
    expect(res.headers.get('location')).toMatch(/\/login\?verificacion=fallida$/)
  })

  it('si Supabase rechaza el enlace rebota al login', async () => {
    verifyOtp.mockResolvedValue(SIN_SESION)
    exchangeCodeForSession.mockResolvedValue(SIN_SESION)
    expect((await pedir('?token_hash=abc&type=email')).headers.get('location'))
      .toMatch(/verificacion=fallida$/)
    expect((await pedir('?code=viejo')).headers.get('location'))
      .toMatch(/verificacion=fallida$/)
  })
})
