import { describe, it, expect, vi, beforeEach } from 'vitest'

const signInWithPassword = vi.fn()
const loginBloqueado = vi.fn()
const registrarIntentoLogin = vi.fn()
const redirect = vi.fn()
const verificarTurnstile = vi.fn()

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ auth: { signInWithPassword } }),
}))
vi.mock('@/lib/auth/limite-intentos', () => ({ loginBloqueado, registrarIntentoLogin }))
// x-forwarded-for con un valor hostil, a proposito: lo manda el cliente. La
// accion ya no lo lee (hallazgo I3) -- resuelve la IP con ipDeConfianza, que
// fuera de produccion devuelve 127.0.0.1 sin mirar ninguna cabecera. Se deja
// puesto para que las aserciones de abajo demuestren que NO se cuela.
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
}))
vi.mock('next/navigation', () => ({ redirect }))
// ip-cliente.ts declara 'server-only', que solo resuelve dentro del bundler
// de Next. Mismo mock que en origen-peticion.test.ts.
vi.mock('server-only', () => ({}))
// El captcha se sustituye para poder fijar su veredicto. La funcion real, con
// su llamada a siteverify y su fallo cerrado, se prueba aparte en
// tests/unit/turnstile.test.ts; lo que se comprueba aqui es el CABLEADO: que
// iniciarSesion la consulta, con que datos, y en que orden respecto al
// limitador y a Supabase.
vi.mock('@/lib/seguridad/turnstile', () => ({
  CAMPO_TURNSTILE: 'cf-turnstile-response',
  verificarTurnstile,
}))

const { iniciarSesion } = await import('@/app/(auth)/login/acciones')
const { MENSAJE_CAPTCHA, MENSAJE_CREDENCIALES } = await import('@/lib/errores/mapear')

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
    registrarIntentoLogin.mockReset().mockResolvedValue(true)
    redirect.mockReset()
    verificarTurnstile.mockReset().mockResolvedValue(true)
  })

  /**
   * Hallazgo I4. El captcha es opcional (bandera de entorno), pero cuando esta
   * activo tiene que decidir ANTES de que se toque Supabase.
   */
  describe('captcha', () => {
    it('rechaza el envio que no supera el captcha, sin llegar a Supabase', async () => {
      verificarTurnstile.mockResolvedValue(false)

      const r = await iniciarSesion({}, formulario('a@b.com', 'ClaveLargaSegura1'))

      expect(r.error).toBe(MENSAJE_CAPTCHA)
      expect(signInWithPassword).not.toHaveBeenCalled()

      // Y NO se contabiliza como intento fallido de login. Si contara, cinco
      // envios con el captcha en blanco bloquearian la cuenta de cualquiera
      // durante 15 minutos sin haber tocado su contrasena.
      expect(registrarIntentoLogin).not.toHaveBeenCalled()
    })

    // El limitador va primero: a una cuenta ya bloqueada se le responde sin
    // gastar una peticion a Cloudflare por cada intento.
    it('no consulta el captcha si la cuenta ya esta bloqueada', async () => {
      loginBloqueado.mockResolvedValue(true)

      const r = await iniciarSesion({}, formulario('a@b.com', 'ClaveLargaSegura1'))

      expect(r.error).toContain('Demasiados intentos')
      expect(verificarTurnstile).not.toHaveBeenCalled()
    })

    it('le pasa el token del formulario y la IP de confianza', async () => {
      signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials' } })
      const fd = formulario('a@b.com', 'ClaveLargaSegura1')
      fd.append('cf-turnstile-response', 'token-del-widget')

      await iniciarSesion({}, fd)

      expect(verificarTurnstile).toHaveBeenCalledWith('token-del-widget', '127.0.0.1')
    })

    // Caso positivo del primero: con el captcha superado, el login sigue su
    // curso normal. Sin esto, una accion que rechazara SIEMPRE pasaria aquella
    // prueba.
    it('con el captcha superado el login continua', async () => {
      signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials' } })

      const r = await iniciarSesion({}, formulario('a@b.com', 'ClaveLargaSegura1'))

      expect(signInWithPassword).toHaveBeenCalled()
      expect(r.error).toBe(MENSAJE_CREDENCIALES)
    })
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
    expect(registrarIntentoLogin).toHaveBeenCalledWith('a@b.com', '127.0.0.1', false)
  })

  /**
   * Hallazgo I3, comprobado en el punto donde importa: la accion completa.
   *
   * tests/unit/ip-cliente.test.ts prueba el helper aislado; esto prueba que la
   * accion lo USA. Sin esta prueba, alguien podria reintroducir la lectura de
   * x-forwarded-for aqui y el helper seguiria verde en su propia suite.
   */
  it('no usa el x-forwarded-for que manda el cliente como IP del limitador', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials' } })

    await iniciarSesion({}, formulario('a@b.com', 'ClaveLargaSegura1'))

    const [, ipUsada] = registrarIntentoLogin.mock.calls[0]
    expect(ipUsada).not.toBe('203.0.113.7')
    // Caso positivo: se llamo, y con la IP que resuelve la politica en un
    // entorno de desarrollo. Sin esto, una accion que no llamara al limitador
    // en absoluto pasaria el `not.toBe`.
    expect(ipUsada).toBe('127.0.0.1')
    expect(loginBloqueado).toHaveBeenCalledWith('a@b.com', '127.0.0.1')
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

  // Antes, registrarIntentoLogin devolvia void y el error del RPC se perdia:
  // si la llamada empezaba a fallar, los intentos dejaban de contarse y el
  // limite se apagaba sin que nadie lo notara. Ahora informa del fallo y
  // iniciarSesion degrada hacia el lado seguro.
  describe('cuando el RPC del limitador falla', () => {
    it('deniega si no se pudo contabilizar el intento FALLIDO', async () => {
      signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials' } })
      registrarIntentoLogin.mockResolvedValue(false)

      const r = await iniciarSesion({}, formulario('a@b.com', 'ClaveLargaSegura1'))

      // Se responde como si ya estuviera bloqueado: con el contador ciego, el
      // sexto intento no se rechazaria nunca.
      expect(r.error).toContain('Demasiados intentos')
      expect(r.error).not.toBe(MENSAJE_CREDENCIALES)
    })

    // Control del caso contrario, en el mismo bloque: si el registro SI
    // funciona, la respuesta vuelve a ser el mensaje uniforme de credenciales.
    // Sin esto, un iniciarSesion que devolviera siempre 'Demasiados intentos'
    // pasaria la prueba de arriba.
    it('con el intento fallido bien registrado responde el mensaje uniforme', async () => {
      signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials' } })
      registrarIntentoLogin.mockResolvedValue(true)

      const r = await iniciarSesion({}, formulario('a@b.com', 'ClaveLargaSegura1'))

      expect(r.error).toBe(MENSAJE_CREDENCIALES)
    })

    // El lado opuesto: si el que falla es el registro del EXITO, las
    // credenciales ya se demostraron correctas. Denegar ahi seria una
    // negacion de servicio autoinfligida sin ganancia de seguridad; lo unico
    // que se pierde es el limpiado de la ventana de fallos, que es
    // conservador.
    it('no deniega si lo que no se pudo registrar es el intento EXITOSO', async () => {
      const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
      const token = `${parte({})}.${parte({ app_metadata: { rol: 'comprador' } })}.f`
      signInWithPassword.mockResolvedValue({ data: { session: { access_token: token } }, error: null })
      registrarIntentoLogin.mockResolvedValue(false)

      const r = await iniciarSesion({}, formulario('v@b.com', 'ClaveLargaSegura1'))

      expect(r).toBeUndefined()
      expect(redirect).toHaveBeenCalledWith('/mi-cuenta')
    })
  })

  it('registra el intento exitoso y redirige al panel del rol', async () => {
    const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const token = `${parte({})}.${parte({ app_metadata: { rol: 'vendedor' } })}.f`
    signInWithPassword.mockResolvedValue({ data: { session: { access_token: token } }, error: null })

    await iniciarSesion({}, formulario('v@b.com', 'ClaveLargaSegura1'))
    expect(registrarIntentoLogin).toHaveBeenCalledWith('v@b.com', '127.0.0.1', true)
    expect(redirect).toHaveBeenCalledWith('/panel')
  })
})
