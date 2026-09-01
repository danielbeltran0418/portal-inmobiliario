import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const rpc = vi.fn()

// server-only lanza fuera de un contexto de servidor; en la suite unitaria no
// aporta nada y se neutraliza.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/cliente-admin', () => ({ crearClienteAdmin: () => ({ rpc }) }))

const { loginBloqueado, registrarIntentoLogin } = await import('@/lib/auth/limite-intentos')

const ERROR_RPC = { code: '42501', message: 'permission denied for function' }

describe('limite de intentos: manejo del error del RPC', () => {
  let errorDeConsola: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    rpc.mockReset()
    errorDeConsola = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    errorDeConsola.mockRestore()
  })

  describe('registrarIntentoLogin', () => {
    // Antes esta funcion devolvia void y no miraba el error: si el RPC
    // empezaba a fallar, los intentos dejaban de contarse y el limite se
    // apagaba sin dejar rastro.
    it('devuelve false y deja el fallo en el log del servidor si el RPC falla', async () => {
      rpc.mockResolvedValue({ data: null, error: ERROR_RPC })

      const registrado = await registrarIntentoLogin('a@b.com', '203.0.113.7', false)

      expect(registrado).toBe(false)
      expect(errorDeConsola).toHaveBeenCalledOnce()
      expect(String(errorDeConsola.mock.calls[0][0])).toContain('registrar_intento_login')
    })

    // Control positivo: sin el, una funcion que devolviera siempre false
    // pasaria la prueba de arriba.
    it('devuelve true y no ensucia el log si el RPC funciona', async () => {
      rpc.mockResolvedValue({ data: null, error: null })

      const registrado = await registrarIntentoLogin('a@b.com', '203.0.113.7', false)

      expect(registrado).toBe(true)
      expect(errorDeConsola).not.toHaveBeenCalled()
    })

    // El correo no debe acabar en los logs de operacion.
    it('no escribe el correo en el log', async () => {
      rpc.mockResolvedValue({ data: null, error: ERROR_RPC })

      await registrarIntentoLogin('victima@ejemplo.com', '203.0.113.7', false)

      expect(JSON.stringify(errorDeConsola.mock.calls)).not.toContain('victima@ejemplo.com')
    })
  })

  describe('loginBloqueado', () => {
    it('falla cerrado y registra el fallo si el RPC falla', async () => {
      rpc.mockResolvedValue({ data: null, error: ERROR_RPC })

      expect(await loginBloqueado('a@b.com', '203.0.113.7')).toBe(true)
      expect(errorDeConsola).toHaveBeenCalledOnce()
      expect(String(errorDeConsola.mock.calls[0][0])).toContain('login_bloqueado')
    })

    // Controles positivos: la funcion tiene que seguir distinguiendo bloqueado
    // de no bloqueado cuando el RPC responde. Sin ellos, un `return true` fijo
    // pasaria la prueba de arriba.
    it('devuelve true cuando el RPC dice que esta bloqueado', async () => {
      rpc.mockResolvedValue({ data: true, error: null })
      expect(await loginBloqueado('a@b.com', '203.0.113.7')).toBe(true)
      expect(errorDeConsola).not.toHaveBeenCalled()
    })

    it('devuelve false cuando el RPC dice que no esta bloqueado', async () => {
      rpc.mockResolvedValue({ data: false, error: null })
      expect(await loginBloqueado('a@b.com', '203.0.113.7')).toBe(false)
      expect(errorDeConsola).not.toHaveBeenCalled()
    })
  })
})
