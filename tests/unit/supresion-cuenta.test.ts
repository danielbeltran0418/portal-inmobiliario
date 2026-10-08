import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const getUser = vi.fn()
const signOutSesion = vi.fn()
const perfil = vi.fn()
const signInWithPassword = vi.fn()
const signOutTemporal = vi.fn()
const deleteUser = vi.fn()
const accionBloqueada = vi.fn()
const registrarIntentoAccion = vi.fn()

// Cadena de consultas del cliente admin: cualquier .from(...).x().y() resuelve
// sin error; aqui solo importa si se llega a borrar el usuario de auth.
function cadena(): unknown {
  const resultado = Promise.resolve({ data: [], error: null })
  return new Proxy(() => {}, {
    get: (_t, prop) => (prop === 'then' ? resultado.then.bind(resultado) : cadena()),
    apply: () => cadena(),
  })
}

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({
    auth: { getUser, signOut: signOutSesion },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: perfil }) }) }),
  }),
}))
vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => ({
    from: () => cadena(),
    rpc: async () => ({ error: null }),
    auth: { admin: { deleteUser } },
  }),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithPassword, signOut: signOutTemporal } }),
}))
vi.mock('@/lib/auth/limite-intentos', () => ({ accionBloqueada, registrarIntentoAccion }))
vi.mock('@/lib/http/ip-cliente', () => ({ ipDeConfianza: () => '127.0.0.1' }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { suprimirCuentaCompradorAction } = await import('@/lib/comprador/acciones-datos')

const FRASE = 'ELIMINAR MI CUENTA'

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1', email: 'c@prueba.test' } } })
  signOutSesion.mockReset().mockResolvedValue({ error: null })
  perfil.mockReset().mockResolvedValue({ data: { rol: 'comprador' } })
  signInWithPassword.mockReset().mockResolvedValue({ data: { session: {} }, error: null })
  signOutTemporal.mockReset().mockResolvedValue({ error: null })
  deleteUser.mockReset().mockResolvedValue({ error: null })
  accionBloqueada.mockReset().mockResolvedValue(false)
  registrarIntentoAccion.mockReset().mockResolvedValue(true)
})

describe('suprimirCuentaCompradorAction (L3: exige la contrasena actual)', () => {
  it('con la frase y la contrasena correctas borra la cuenta (control positivo)', async () => {
    const r = await suprimirCuentaCompradorAction(FRASE, 'ClaveCorrecta123')
    expect(r.exito).toBe(true)
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'c@prueba.test', password: 'ClaveCorrecta123' })
    expect(deleteUser).toHaveBeenCalledWith('u1')
  })

  it('con una contrasena incorrecta no borra nada y cuenta el fallo como de login', async () => {
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: { code: 'invalid_credentials' } })
    const r = await suprimirCuentaCompradorAction(FRASE, 'ClaveIncorrecta')
    expect(r.exito).toBe(false)
    expect(deleteUser).not.toHaveBeenCalled()
    expect(registrarIntentoAccion).toHaveBeenCalledWith('login', 'c@prueba.test', '127.0.0.1', false)
  })

  it('sin contrasena no llega a comprobar nada', async () => {
    const r = await suprimirCuentaCompradorAction(FRASE, '')
    expect(r.exito).toBe(false)
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('con el limite de intentos agotado no prueba la contrasena', async () => {
    accionBloqueada.mockResolvedValue(true)
    const r = await suprimirCuentaCompradorAction(FRASE, 'ClaveCorrecta123')
    expect(r.error).toMatch(/15 minutos/)
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('una cuenta que no es de comprador no se puede suprimir por aqui', async () => {
    perfil.mockResolvedValue({ data: { rol: 'vendedor' } })
    const r = await suprimirCuentaCompradorAction(FRASE, 'ClaveCorrecta123')
    expect(r.exito).toBe(false)
    expect(deleteUser).not.toHaveBeenCalled()
  })
})
