import { describe, it, expect, vi, beforeEach } from 'vitest'

const getClaims = vi.fn()
const getSession = vi.fn()
const getUser = vi.fn()
vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ auth: { getClaims, getSession, getUser } }),
}))
// cache() de React memoiza entre llamadas del mismo render; en la prueba se anula.
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()), cache: <T,>(f: T) => f }))

const { sesionActual, SIN_SESION } = await import('@/lib/auth/sesion')
const { rolDesdeClaims } = await import('@/lib/auth/roles')

describe('sesionActual con getClaims()', () => {
  beforeEach(() => {
    getClaims.mockReset()
    getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    getUser.mockReset()
  })

  it('sin sesion: SIN_SESION y ningun viaje al servidor de auth', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })
    expect(await sesionActual()).toEqual(SIN_SESION)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('con claims verificadas: el id sale de sub y el token de la sesion', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'u1', app_metadata: { rol: 'vendedor' } } }, error: null })
    expect(await sesionActual()).toEqual({ hayUsuario: true, accessToken: 'tok', idUsuario: 'u1' })
    expect(getUser).not.toHaveBeenCalled()
  })

  it('un token invalido o caducado (error de getClaims) no abre sesion', async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: 'invalid JWT' } })
    expect(await sesionActual()).toEqual(SIN_SESION)
  })
})

describe('rolDesdeClaims', () => {
  it.each([
    [{ app_metadata: { rol: 'vendedor' } }, 'vendedor'],
    [{ app_metadata: { rol: 'super_admin' } }, 'super_admin'],
    [{ app_metadata: { rol: 'hacker' } }, 'comprador'],
    [{}, 'comprador'],
    [null, 'comprador'],
  ])('%j -> %s (ante la duda, el de menos privilegio)', (claims, rol) => {
    expect(rolDesdeClaims(claims as never)).toBe(rol)
  })
})
