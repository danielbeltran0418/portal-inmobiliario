import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const verifyOtp = vi.fn()
const exchangeCodeForSession = vi.fn()

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ auth: { verifyOtp, exchangeCodeForSession } }),
}))

const { GET } = await import('@/app/confirmar/recuperacion/route')
const { COOKIE_RECUPERACION } = await import('@/lib/auth/recuperacion')

const CON_SESION = { data: { session: { access_token: 't' }, user: { id: 'u1' } }, error: null }
const SIN_SESION = { data: { session: null, user: null }, error: { code: 'otp_expired' } }

function pedir(query: string) {
  return GET(new NextRequest(`http://127.0.0.1:3000/confirmar/recuperacion${query}`))
}

describe('GET /confirmar/recuperacion', () => {
  beforeEach(() => {
    verifyOtp.mockReset()
    exchangeCodeForSession.mockReset()
  })

  it('con token_hash de tipo recovery abre sesion y lleva a /restablecer', async () => {
    verifyOtp.mockResolvedValue(CON_SESION)
    const res = await pedir('?token_hash=abc&type=recovery')
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'abc' })
    expect(res.headers.get('location')).toMatch(/\/restablecer$/)
    const cookie = res.cookies.get(COOKIE_RECUPERACION)
    expect(cookie?.value).toBe('u1')
    expect(cookie?.httpOnly).toBe(true)
  })

  it('con code (plantilla del proyecto alojado) canjea el codigo', async () => {
    exchangeCodeForSession.mockResolvedValue(CON_SESION)
    const res = await pedir('?code=pkce-1')
    expect(exchangeCodeForSession).toHaveBeenCalledWith('pkce-1')
    expect(res.headers.get('location')).toMatch(/\/restablecer$/)
  })

  it('un token de otro tipo no se acepta aqui', async () => {
    const res = await pedir('?token_hash=abc&type=email')
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toMatch(/\/recuperar\?enlace=invalido$/)
  })

  it('un enlace caducado vuelve a pedir el correo', async () => {
    verifyOtp.mockResolvedValue(SIN_SESION)
    const res = await pedir('?token_hash=viejo&type=recovery')
    expect(res.headers.get('location')).toMatch(/\/recuperar\?enlace=invalido$/)
    expect(res.cookies.get(COOKIE_RECUPERACION)).toBeUndefined()
  })
})
