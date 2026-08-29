import { describe, it, expect, vi, beforeEach } from 'vitest'

const signInWithPassword = vi.fn()
const loginBloqueado = vi.fn()
const registrarIntentoLogin = vi.fn()
const redirect = vi.fn()

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ auth: { signInWithPassword } }),
}))
vi.mock('@/lib/auth/limite-intentos', () => ({ loginBloqueado, registrarIntentoLogin }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
}))
vi.mock('next/navigation', () => ({ redirect }))

const { iniciarSesion } = await import('@/app/(auth)/login/acciones')
const { MENSAJE_CREDENCIALES } = await import('@/lib/errores/mapear')

function formulario(correo: string, password: string): FormData {
  const fd = new FormData()
  fd.append('correo', correo)
  fd.append('password', password)
  return fd
}

describe('iniciarSesion', () => {
  beforeEach(() => {
    signInWithPassword.mockReset()
    loginBloqueado.mockReset().mockResolvedValue(false)
    registrarIntentoLogin.mockReset().mockResolvedValue(undefined)
    redirect.mockReset()
  })

  it('rechaza sin llamar a Supabase cuando la combinacion esta bloqueada', async () => {
    loginBloqueado.mockResolvedValue(true)
    const r = await iniciarSesion({}, formulario('a@b.com', 'ClaveLargaSegura1'))
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(r.error).toContain('Demasiados intentos')
  })

  it('registra el intento fallido', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials' } })
    await iniciarSesion({}, formulario('a@b.com', 'ClaveLargaSegura1'))
    expect(registrarIntentoLogin).toHaveBeenCalledWith('a@b.com', '203.0.113.7', false)
  })

  it('usa el mismo mensaje ante credenciales invalidas', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials' } })
    const r = await iniciarSesion({}, formulario('a@b.com', 'ClaveLargaSegura1'))
    expect(r.error).toBe(MENSAJE_CREDENCIALES)
  })

  it('usa el mismo mensaje ante un usuario inexistente', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'user_not_found' } })
    const r = await iniciarSesion({}, formulario('nadie@b.com', 'ClaveLargaSegura1'))
    expect(r.error).toBe(MENSAJE_CREDENCIALES)
  })

  it('registra el intento exitoso y redirige al panel del rol', async () => {
    const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const token = `${parte({})}.${parte({ app_metadata: { rol: 'vendedor' } })}.f`
    signInWithPassword.mockResolvedValue({ data: { session: { access_token: token } }, error: null })

    await iniciarSesion({}, formulario('v@b.com', 'ClaveLargaSegura1'))
    expect(registrarIntentoLogin).toHaveBeenCalledWith('v@b.com', '203.0.113.7', true)
    expect(redirect).toHaveBeenCalledWith('/panel')
  })
})
