import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// turnstile.ts declara 'server-only', que solo resuelve dentro del bundler de
// Next. Mismo mock que en origen-peticion.test.ts e ip-cliente.test.ts.
vi.mock('server-only', () => ({}))

import { CAMPO_TURNSTILE, claveDeSitioTurnstile, verificarTurnstile } from '@/lib/seguridad/turnstile'

const SITIO = '1x00000000000000000000AA'
const SECRETA = '1x0000000000000000000000000000000AA'

function respuesta(cuerpo: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => cuerpo,
  } as unknown as Response
}

function cuerpoEnviado(peticion: ReturnType<typeof vi.fn>): URLSearchParams {
  return new URLSearchParams(peticion.mock.calls[0][1].body.toString())
}

describe('verificarTurnstile', () => {
  const fetchFalso = vi.fn()

  beforeEach(() => {
    fetchFalso.mockReset()
    vi.stubGlobal('fetch', fetchFalso)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('sin configurar', () => {
    beforeEach(() => {
      vi.stubEnv('TURNSTILE_SITE_KEY', '')
      vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    })

    it('no hay clave de sitio, asi que no se pinta widget', () => {
      expect(claveDeSitioTurnstile()).toBeNull()
    })

    /**
     * Es el estado de SP0 hasta que existan las claves: el formulario tiene que
     * seguir funcionando exactamente igual que antes del hallazgo I4. Un token
     * ausente no puede rechazar nada aqui.
     */
    it('deja pasar sin token y sin llamar a Cloudflare', async () => {
      expect(await verificarTurnstile(null, null)).toBe(true)
      expect(fetchFalso).not.toHaveBeenCalled()
    })
  })

  describe('a medio configurar', () => {
    /**
     * Media configuracion es un error de despliegue, no un modo de
     * funcionamiento. Con solo la secreta no habria widget y NADIE podria
     * entrar; con solo la publica se pintaria un desafio que nadie verifica.
     * En los dos casos el captcha queda desactivado y se avisa una vez.
     *
     * resetModules antes de importar: el aviso es de una sola vez por proceso
     * y otra prueba podria haberlo gastado ya.
     */
    it('con solo la clave publica queda desactivado y avisa', async () => {
      vi.resetModules()
      vi.stubEnv('TURNSTILE_SITE_KEY', SITIO)
      vi.stubEnv('TURNSTILE_SECRET_KEY', '')
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const modulo = await import('@/lib/seguridad/turnstile')

      expect(modulo.claveDeSitioTurnstile()).toBeNull()
      expect(await modulo.verificarTurnstile('token', null)).toBe(true)
      expect(fetchFalso).not.toHaveBeenCalled()
      expect(aviso).toHaveBeenCalledTimes(1)
      expect(aviso.mock.calls[0][0]).toContain('TURNSTILE_SECRET_KEY')
    })

    it('con solo la clave secreta queda desactivado y avisa', async () => {
      vi.resetModules()
      vi.stubEnv('TURNSTILE_SITE_KEY', '')
      vi.stubEnv('TURNSTILE_SECRET_KEY', SECRETA)
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const modulo = await import('@/lib/seguridad/turnstile')

      expect(modulo.claveDeSitioTurnstile()).toBeNull()
      expect(await modulo.verificarTurnstile('token', null)).toBe(true)
      expect(aviso.mock.calls[0][0]).toContain('TURNSTILE_SITE_KEY')
    })
  })

  describe('configurado', () => {
    beforeEach(() => {
      vi.stubEnv('TURNSTILE_SITE_KEY', SITIO)
      vi.stubEnv('TURNSTILE_SECRET_KEY', SECRETA)
    })

    it('expone la clave publica para pintar el widget', () => {
      expect(claveDeSitioTurnstile()).toBe(SITIO)
    })

    it('rechaza sin gastar una llamada cuando no llega token', async () => {
      expect(await verificarTurnstile(null, null)).toBe(false)
      expect(await verificarTurnstile('   ', null)).toBe(false)
      // Un File en vez de una cadena: FormData.get puede devolverlo, y sin la
      // comprobacion de tipo acabaria concatenado en el cuerpo de la peticion.
      expect(await verificarTurnstile(new File([], 'x'), null)).toBe(false)
      expect(fetchFalso).not.toHaveBeenCalled()
    })

    it('acepta cuando siteverify responde success', async () => {
      fetchFalso.mockResolvedValue(respuesta({ success: true }))
      expect(await verificarTurnstile('token-bueno', '203.0.113.7')).toBe(true)

      const [url, opciones] = fetchFalso.mock.calls[0]
      expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
      expect(opciones.method).toBe('POST')

      const cuerpo = cuerpoEnviado(fetchFalso)
      expect(cuerpo.get('secret')).toBe(SECRETA)
      expect(cuerpo.get('response')).toBe('token-bueno')
      expect(cuerpo.get('remoteip')).toBe('203.0.113.7')
    })

    // Sin IP de confianza (hallazgo I3, modo degradado) no se manda remoteip.
    // Mandar una IP sacada de una cabecera del cliente seria devolverle a
    // Cloudflare justo el dato falsificable que se quito de en medio.
    it('omite remoteip cuando no hay IP de confianza', async () => {
      fetchFalso.mockResolvedValue(respuesta({ success: true }))
      await verificarTurnstile('token-bueno', null)
      expect(cuerpoEnviado(fetchFalso).has('remoteip')).toBe(false)
    })

    it('rechaza cuando siteverify responde que no', async () => {
      fetchFalso.mockResolvedValue(
        respuesta({ success: false, 'error-codes': ['invalid-input-response'] }),
      )
      expect(await verificarTurnstile('token-malo', null)).toBe(false)
    })

    /**
     * Se falla CERRADO. Si una caida de Cloudflare, un 500, o un cuerpo
     * inesperado dejaran pasar el formulario, cualquiera que consiguiera
     * estorbar esa peticion saliente tendria un interruptor para apagar el
     * captcha. Cada rama va con su comparacion contra el caso que SI pasa, en
     * el mismo bloque, para que un verificarTurnstile que devolviera siempre
     * false no se cuele como verde.
     */
    describe('ante una respuesta que no se puede creer', () => {
      it('rechaza si el HTTP no es correcto', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        fetchFalso.mockResolvedValue(respuesta({ success: true }, false, 503))
        expect(await verificarTurnstile('token', null)).toBe(false)
      })

      it('rechaza si la peticion falla o se agota el tiempo', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        fetchFalso.mockRejectedValue(new DOMException('The operation was aborted', 'TimeoutError'))
        expect(await verificarTurnstile('token', null)).toBe(false)
      })

      it('rechaza si el cuerpo no trae success booleano', async () => {
        fetchFalso.mockResolvedValue(respuesta({ success: 'true' }))
        expect(await verificarTurnstile('token', null)).toBe(false)

        fetchFalso.mockResolvedValue(respuesta({}))
        expect(await verificarTurnstile('token', null)).toBe(false)

        // Control: con el mismo token y el mismo camino, un success booleano
        // SI pasa. Sin esto las tres aserciones de arriba serian igual de
        // verdes con una funcion que devolviera false siempre.
        fetchFalso.mockResolvedValue(respuesta({ success: true }))
        expect(await verificarTurnstile('token', null)).toBe(true)
      })
    })

    it('manda un tiempo limite para no quedarse colgado', async () => {
      fetchFalso.mockResolvedValue(respuesta({ success: true }))
      await verificarTurnstile('token', null)
      expect(fetchFalso.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    })
  })

  it('el nombre del campo es el que inyecta Cloudflare', () => {
    // Si esto cambiara, el server action leeria siempre null y el captcha
    // rechazaria todo. No es un detalle cosmetico.
    expect(CAMPO_TURNSTILE).toBe('cf-turnstile-response')
  })
})
