import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

// ip-cliente.ts declara 'server-only'. Ese paquete solo resuelve a un modulo
// vacio bajo la condicion de resolucion "react-server" que pone el bundler de
// Next; vitest no la pone. Mismo mock que en origen-peticion.test.ts.
vi.mock('server-only', () => ({}))

import { ipDeConfianza } from '@/lib/http/ip-cliente'

const CABECERA_PLATAFORMA = 'x-vercel-forwarded-for'

function enProduccionCon(cabeceras: Record<string, string>): Headers {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('IP_CABECERA_CONFIABLE', CABECERA_PLATAFORMA)
  return new Headers(cabeceras)
}

describe('ipDeConfianza', () => {
  beforeEach(() => {
    // El aviso de degradacion es un console.warn con estado de modulo (se
    // emite una sola vez por proceso). Se silencia para no ensuciar la salida
    // de la suite; lo que se prueba es el valor devuelto, no el log.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('en produccion', () => {
    /**
     * LA PRUEBA DEL HALLAZGO I3.
     *
     * `1.2.3.4` es lo que mando el cliente; `5.6.7.8` lo anadio el proxy al
     * final de la cadena. La implementacion anterior devolvia la PRIMERA
     * entrada, es decir, exactamente el dato que controla el atacante: rotarlo
     * apagaba el limite por IP y fijarlo a la IP de otro bloqueaba a esa
     * persona.
     */
    it('no devuelve la primera entrada de la cadena, que la pone el cliente', () => {
      const cabeceras = enProduccionCon({ [CABECERA_PLATAFORMA]: '1.2.3.4, 5.6.7.8' })

      const ip = ipDeConfianza(cabeceras)

      expect(ip).not.toBe('1.2.3.4')
      // Y el caso positivo en la misma prueba: no basta con que no sea la del
      // cliente. Una implementacion que devolviera siempre null pasaria el
      // `not.toBe` de arriba y habria apagado la discriminacion por IP para
      // todo el mundo.
      expect(ip).toBe('5.6.7.8')
    })

    it('con un solo salto devuelve esa IP', () => {
      expect(ipDeConfianza(enProduccionCon({ [CABECERA_PLATAFORMA]: '203.0.113.7' })))
        .toBe('203.0.113.7')
    })

    it('ignora x-forwarded-for, que no es la cabecera de la plataforma', () => {
      // El atacante manda x-forwarded-for a mano; la plataforma escribe la
      // suya. Si la resolucion mirase x-forwarded-for, el hallazgo seguiria
      // abierto con otro nombre.
      const cabeceras = enProduccionCon({
        'x-forwarded-for': '9.9.9.9',
        [CABECERA_PLATAFORMA]: '203.0.113.7',
      })

      expect(ipDeConfianza(cabeceras)).toBe('203.0.113.7')
    })

    it('degrada a null si la cabecera de la plataforma no llega', () => {
      // Solo la cabecera falsificable presente: no hay IP de confianza.
      const cabeceras = enProduccionCon({ 'x-forwarded-for': '9.9.9.9' })

      expect(ipDeConfianza(cabeceras)).toBeNull()
    })

    it('degrada a null si IP_CABECERA_CONFIABLE no esta configurada', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('IP_CABECERA_CONFIABLE', '')

      const cabeceras = new Headers({ 'x-forwarded-for': '9.9.9.9' })

      expect(ipDeConfianza(cabeceras)).toBeNull()
    })

    it('sin ninguna cabecera no revienta y degrada a null', () => {
      expect(ipDeConfianza(enProduccionCon({}))).toBeNull()
    })

    it('degrada a null si la ultima entrada no es una IP', () => {
      // Llegaria hasta la columna `inet` y el INSERT reventaria con 22P02; el
      // limitador acabaria denegando por precaucion a usuarios legitimos.
      const cabeceras = enProduccionCon({ [CABECERA_PLATAFORMA]: '203.0.113.7, no-es-una-ip' })

      expect(ipDeConfianza(cabeceras)).toBeNull()
    })

    it('rechaza octetos fuera de rango', () => {
      expect(ipDeConfianza(enProduccionCon({ [CABECERA_PLATAFORMA]: '999.1.1.1' }))).toBeNull()
    })

    it('acepta IPv6 y le quita corchetes y puerto', () => {
      expect(ipDeConfianza(enProduccionCon({ [CABECERA_PLATAFORMA]: '2001:db8::1' })))
        .toBe('2001:db8::1')
      expect(ipDeConfianza(enProduccionCon({ [CABECERA_PLATAFORMA]: '[2001:db8::1]:443' })))
        .toBe('2001:db8::1')
    })

    it('le quita el puerto a una IPv4', () => {
      expect(ipDeConfianza(enProduccionCon({ [CABECERA_PLATAFORMA]: '203.0.113.7:41234' })))
        .toBe('203.0.113.7')
    })

    it('tolera espacios y entradas vacias en la cadena', () => {
      expect(ipDeConfianza(enProduccionCon({ [CABECERA_PLATAFORMA]: ' 1.2.3.4 ,  5.6.7.8 , ' })))
        .toBe('5.6.7.8')
    })
  })

  describe('en desarrollo', () => {
    it('devuelve 127.0.0.1 e ignora por completo las cabeceras', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('IP_CABECERA_CONFIABLE', CABECERA_PLATAFORMA)

      // Las dos cabeceras con valores hostiles: en local no hay proxy delante,
      // asi que cualquiera de las dos la habria puesto el cliente.
      const cabeceras = new Headers({
        'x-forwarded-for': '9.9.9.9',
        [CABECERA_PLATAFORMA]: '8.8.8.8',
      })

      expect(ipDeConfianza(cabeceras)).toBe('127.0.0.1')
    })
  })
})
