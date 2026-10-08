import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const getClaims = vi.fn()
const perfil = vi.fn()
const eqMock = vi.fn()

const cliente = {
  auth: { getClaims },
  from: () => ({
    select: () => ({
      eq: (col: string, valor: string) => {
        eqMock(col, valor)
        return { maybeSingle: perfil }
      },
    }),
  }),
}

vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => cliente }))

const { accesoAdmin } = await import('@/lib/auth/admin')

describe('accesoAdmin', () => {
  beforeEach(() => {
    getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: 'u1', aal: 'aal2' } }, error: null })
    perfil.mockReset().mockResolvedValue({ data: { rol: 'super_admin' } })
    eqMock.mockReset()
  })

  it('super_admin con sesion aal2: ok', async () => {
    const r = await accesoAdmin()
    expect(r).toMatchObject({ estado: 'ok', adminId: 'u1' })
    expect(eqMock).toHaveBeenCalledWith('id', 'u1')
  })

  // M2: la contrasena sola no basta.
  it('super_admin con sesion aal1: falta_mfa', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'u1', aal: 'aal1' } }, error: null })
    expect((await accesoAdmin()).estado).toBe('falta_mfa')
  })

  // L1: el rol se lee de la base. Un token que todavia diga super_admin no
  // cuenta si perfiles ya no lo dice.
  it('rol degradado en la base: no_admin aunque el token siga siendo aal2', async () => {
    perfil.mockResolvedValue({ data: { rol: 'vendedor' } })
    expect((await accesoAdmin()).estado).toBe('no_admin')
  })

  it('sin perfil legible: no_admin', async () => {
    perfil.mockResolvedValue({ data: null })
    expect((await accesoAdmin()).estado).toBe('no_admin')
  })

  it('token no verificable: sin_sesion y no consulta la base', async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: 'firma invalida' } })
    expect((await accesoAdmin()).estado).toBe('sin_sesion')
    expect(perfil).not.toHaveBeenCalled()
  })
})
