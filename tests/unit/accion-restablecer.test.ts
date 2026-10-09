import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const getUser = vi.fn()
const getSession = vi.fn()
const getClaims = vi.fn()
const updateUser = vi.fn()
const almacen = { get: vi.fn(), delete: vi.fn() }
const redirect = vi.fn((destino: string) => { throw new Error(`REDIRECT:${destino}`) })

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ auth: { getUser, getSession, getClaims, updateUser } }),
}))
vi.mock('next/headers', () => ({ cookies: async () => almacen }))
vi.mock('next/navigation', () => ({ redirect }))

const { restablecerContrasena } = await import('@/app/(auth)/restablecer/acciones')
const { COOKIE_RECUPERACION, MENSAJE_ENLACE_RECUPERACION } = await import('@/lib/auth/recuperacion')

function token(rol: string): string {
  return `x.${Buffer.from(JSON.stringify({ app_metadata: { rol } })).toString('base64url')}.y`
}

function claims(amr: unknown, sub = 'u1') {
  return { data: { claims: { sub, amr } }, error: null }
}

const ahora = () => Math.floor(Date.now() / 1000)

function formulario(password: string, confirmacion = password): FormData {
  const fd = new FormData()
  fd.append('password', password)
  fd.append('confirmacion', confirmacion)
  return fd
}

describe('restablecerContrasena', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getSession.mockReset().mockResolvedValue({ data: { session: { access_token: token('vendedor') } } })
    getClaims.mockReset().mockResolvedValue(claims([{ method: 'otp', timestamp: ahora() - 60 }]))
    updateUser.mockReset().mockResolvedValue({ data: {}, error: null })
    almacen.get.mockReset().mockReturnValue({ value: 'u1' })
    almacen.delete.mockReset()
    redirect.mockClear()
  })

  it('cambia la contrasena, consume la marca y lleva al panel del rol', async () => {
    await expect(restablecerContrasena({}, formulario('ClaveNuevaSegura1'))).rejects.toThrow('REDIRECT:/panel')
    expect(updateUser).toHaveBeenCalledWith({ password: 'ClaveNuevaSegura1' })
    expect(almacen.delete).toHaveBeenCalledWith(COOKIE_RECUPERACION)
  })

  it('sin la marca del enlace de recuperacion no cambia nada', async () => {
    almacen.get.mockReturnValue(undefined)
    const r = await restablecerContrasena({}, formulario('ClaveNuevaSegura1'))
    expect(r.error).toBe(MENSAJE_ENLACE_RECUPERACION)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('una marca de otro usuario no sirve', async () => {
    almacen.get.mockReturnValue({ value: 'otro' })
    const r = await restablecerContrasena({}, formulario('ClaveNuevaSegura1'))
    expect(r.error).toBe(MENSAJE_ENLACE_RECUPERACION)
    expect(updateUser).not.toHaveBeenCalled()
  })

  // M1 de la auditoria: la cookie solo lleva el id del usuario, que conoce
  // cualquiera con la sesion abierta. Lo que decide es el amr firmado.
  it('una cookie valida sin sesion abierta por el enlace (amr password) no sirve', async () => {
    getClaims.mockResolvedValue(claims([{ method: 'password', timestamp: ahora() - 60 }]))
    const r = await restablecerContrasena({}, formulario('ClaveNuevaSegura1'))
    expect(r.error).toBe(MENSAJE_ENLACE_RECUPERACION)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('un enlace usado hace mas de 15 minutos no sirve', async () => {
    getClaims.mockResolvedValue(claims([{ method: 'otp', timestamp: ahora() - 16 * 60 }]))
    const r = await restablecerContrasena({}, formulario('ClaveNuevaSegura1'))
    expect(r.error).toBe(MENSAJE_ENLACE_RECUPERACION)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('si no se pueden verificar las claims, no cambia nada', async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: 'jwt invalido' } })
    const r = await restablecerContrasena({}, formulario('ClaveNuevaSegura1'))
    expect(r.error).toBe(MENSAJE_ENLACE_RECUPERACION)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('acepta tambien el amr recovery del flujo PKCE', async () => {
    getClaims.mockResolvedValue(claims([{ method: 'recovery', timestamp: ahora() - 30 }]))
    await expect(restablecerContrasena({}, formulario('ClaveNuevaSegura1'))).rejects.toThrow('REDIRECT:/panel')
    expect(updateUser).toHaveBeenCalled()
  })

  it('exige 12 caracteres y que la confirmacion coincida', async () => {
    expect((await restablecerContrasena({}, formulario('corta'))).error).toMatch(/12/)
    expect((await restablecerContrasena({}, formulario('ClaveNuevaSegura1', 'OtraClaveSegura1'))).error)
      .toMatch(/no coinciden/)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('si Supabase rechaza la clave (p. ej. igual a la anterior) lo dice sin redirigir', async () => {
    updateUser.mockResolvedValue({ data: null, error: { code: 'same_password', message: 'x' } })
    const r = await restablecerContrasena({}, formulario('ClaveNuevaSegura1'))
    expect(r.error).toMatch(/distinta/)
    expect(almacen.delete).not.toHaveBeenCalled()
  })
})
