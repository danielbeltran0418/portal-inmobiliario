import { describe, it, expect, vi, beforeEach } from 'vitest'

const signUp = vi.fn()
const verificarTurnstile = vi.fn()

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ auth: { signUp } }),
}))
// ip-cliente.ts declara 'server-only', que solo resuelve dentro del bundler de
// Next. Mismo mock que en origen-peticion.test.ts.
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
// El captcha se sustituye para fijar su veredicto; la funcion real se prueba en
// tests/unit/turnstile.test.ts. Aqui se comprueba el cableado.
vi.mock('@/lib/seguridad/turnstile', () => ({
  CAMPO_TURNSTILE: 'cf-turnstile-response',
  verificarTurnstile,
}))

const { registrarUsuario } = await import('@/app/(auth)/registro/acciones')
const { MENSAJE_CAPTCHA } = await import('@/lib/errores/mapear')

function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.append(k, v)
  return fd
}

const validos = {
  nombre: 'Ana Perez',
  correo: 'ana@ejemplo.com',
  telefono: '3001234567',
  password: 'ClaveLargaSegura1',
  rol: 'comprador',
}

describe('registrarUsuario', () => {
  beforeEach(() => {
    signUp.mockReset()
    signUp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    verificarTurnstile.mockReset().mockResolvedValue(true)
  })

  /**
   * Hallazgo I4. El registro no tiene limite de intentos que lo proteja -- el
   * de intentos_login solo cubre el login -- asi que el captcha es aqui la
   * unica barrera contra el alta masiva de cuentas.
   */
  describe('captcha', () => {
    it('rechaza el envio que no supera el captcha, sin crear la cuenta', async () => {
      verificarTurnstile.mockResolvedValue(false)

      const r = await registrarUsuario({}, formulario(validos))

      expect(r.error).toBe(MENSAJE_CAPTCHA)
      expect(r.exito).toBeUndefined()
      expect(signUp).not.toHaveBeenCalled()
    })

    it('le pasa el token del formulario', async () => {
      await registrarUsuario(
        {},
        formulario({ ...validos, 'cf-turnstile-response': 'token-del-widget' }),
      )
      expect(verificarTurnstile.mock.calls[0][0]).toBe('token-del-widget')
    })

    // Caso positivo del primero, en el mismo bloque: con el captcha superado la
    // cuenta si se crea. Sin esto, una accion que rechazara siempre pasaria.
    it('con el captcha superado el registro continua', async () => {
      const r = await registrarUsuario({}, formulario(validos))
      expect(signUp).toHaveBeenCalled()
      expect(r.exito).toBe(true)
    })
  })

  it('envia el rol solicitado dentro de los metadatos', async () => {
    await registrarUsuario({}, formulario({ ...validos, rol: 'vendedor' }))
    expect(signUp.mock.calls[0][0].options.data.rol_solicitado).toBe('vendedor')
  })

  it('rechaza el rol super_admin sin llamar a Supabase', async () => {
    const r = await registrarUsuario({}, formulario({ ...validos, rol: 'super_admin' }))
    expect(signUp).not.toHaveBeenCalled()
    expect(r.error).toBeTruthy()
  })

  it('rechaza una contrasena corta sin llamar a Supabase', async () => {
    const r = await registrarUsuario({}, formulario({ ...validos, password: 'corta' }))
    expect(signUp).not.toHaveBeenCalled()
    expect(r.error).toBeTruthy()
  })

  it('no revela si el correo ya estaba registrado: mismo mensaje para cualquier error', async () => {
    signUp.mockResolvedValue({ data: { user: null }, error: { code: 'user_already_exists' } })
    const rCorreoExistente = await registrarUsuario({}, formulario(validos))

    signUp.mockResolvedValue({ data: { user: null }, error: { code: 'fallo_generico' } })
    const rFalloGenerico = await registrarUsuario({}, formulario(validos))

    expect(rCorreoExistente.error).toBeTruthy()
    expect(rCorreoExistente.error).toBe(rFalloGenerico.error)
  })

  it('apunta emailRedirectTo a /confirmar', async () => {
    await registrarUsuario({}, formulario(validos))
    expect(signUp.mock.calls[0][0].options.emailRedirectTo).toMatch(/\/confirmar$/)
  })

  it('devuelve exito cuando el registro funciona', async () => {
    const r = await registrarUsuario({}, formulario(validos))
    expect(r.exito).toBe(true)
  })
})
