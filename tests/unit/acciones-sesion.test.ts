import { describe, it, expect, vi, beforeEach } from 'vitest'

const signOut = vi.fn()
const redirect = vi.fn()
const getAll = vi.fn()
const borrar = vi.fn()

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ auth: { signOut } }),
}))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll, delete: borrar }),
}))

const { cerrarSesion } = await import('@/componentes/acciones-sesion')

const cookie = (name: string) => ({ name, value: 'x' })

describe('cerrarSesion', () => {
  beforeEach(() => {
    signOut.mockReset().mockResolvedValue({ error: null })
    redirect.mockReset()
    getAll.mockReset().mockReturnValue([])
    borrar.mockReset()
  })

  /**
   * =========================================================================
   * EL ALCANCE DEL CIERRE
   * =========================================================================
   *
   * Esta es la asercion que justifica el archivo entero, y no es una
   * comprobacion de estilo: `signOut()` SIN ARGUMENTOS no cierra la sesion de
   * este navegador, cierra la de TODOS los dispositivos de la cuenta. La firma
   * de la libreria instalada es `async signOut(options = { scope: 'global' })`
   * (@supabase/auth-js 2.112.4) y su JSDoc avisa de que 'global' desconecta
   * "every device they are currently signed in on".
   *
   * O sea que el fallo contra el que protege esto no se ve leyendo el codigo
   * de la accion -- ahi solo pone `signOut(...)` -- ni lo detecta la prueba
   * e2e con un solo navegador, que veria exactamente lo mismo en los dos
   * casos. Solo se manifiesta con dos dispositivos a la vez, que es
   * precisamente el escenario que nadie prueba a mano.
   *
   * Por eso se fija el argumento aqui, en la frontera con la libreria: si
   * alguien "simplifica" la llamada quitando el objeto, esta prueba cae, en
   * lugar de que lo descubra un vendedor al que se le cierra el movil desde el
   * escritorio.
   */
  it('cierra la sesion SOLO en este dispositivo, no en todos', async () => {
    await cerrarSesion()

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })

    // El lado negativo, explicito, porque es el que duele: ni el scope global
    // ni la llamada pelada (que es global por defecto) valen aqui.
    expect(signOut).not.toHaveBeenCalledWith({ scope: 'global' })
    expect(signOut).not.toHaveBeenCalledWith()
  })

  /**
   * El borrado manual de cookies es una RED, no el camino normal. Si se
   * ejecutara siempre daria igual que signOut funcionara o no, y la prueba de
   * abajo dejaria de significar nada.
   */
  it('no toca las cookies cuando signOut va bien', async () => {
    getAll.mockReturnValue([cookie('sb-abc-auth-token')])

    await cerrarSesion()

    expect(borrar).not.toHaveBeenCalled()
  })

  it('borra las cookies de sesion -- y solo esas -- si signOut falla', async () => {
    signOut.mockResolvedValue({ error: { message: 'auth caido' } })
    getAll.mockReturnValue([
      cookie('sb-abc-auth-token'),
      cookie('sb-abc-auth-token.0'),
      cookie('sb-abc-auth-token.1'),
      // Ajenas a la sesion: si el barrido se llevara estas por delante, el
      // cierre de sesion estaria borrando preferencias del usuario de paso.
      cookie('tema'),
      cookie('sb-abc-otra-cosa'),
    ])

    await cerrarSesion()

    expect(borrar.mock.calls.flat()).toEqual([
      'sb-abc-auth-token',
      'sb-abc-auth-token.0',
      'sb-abc-auth-token.1',
    ])
  })

  it('lleva a la landing en los dos casos', async () => {
    await cerrarSesion()
    expect(redirect).toHaveBeenCalledWith('/')

    redirect.mockReset()
    signOut.mockResolvedValue({ error: { message: 'auth caido' } })
    await cerrarSesion()
    expect(redirect).toHaveBeenCalledWith('/')
  })
})
