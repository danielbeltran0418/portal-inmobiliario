import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipDeConfianza } from '@/lib/http/ip-cliente'
import { accionBloqueada, registrarIntentoAccion } from '@/lib/auth/limite-intentos'

const resetPasswordForEmail = vi.fn()
const verificarTurnstile = vi.fn()

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ auth: { resetPasswordForEmail } }),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: '127.0.0.1:3000' }) }))
vi.mock('@/lib/seguridad/turnstile', () => ({
  CAMPO_TURNSTILE: 'cf-turnstile-response',
  verificarTurnstile,
}))
vi.mock('@/lib/http/ip-cliente', () => ({ ipDeConfianza: vi.fn() }))
vi.mock('@/lib/auth/limite-intentos', () => ({
  accionBloqueada: vi.fn(),
  registrarIntentoAccion: vi.fn(),
}))

const { solicitarRecuperacion } = await import('@/app/(auth)/recuperar/acciones')
const { MENSAJE_RECUPERACION_ENVIADA } = await import('@/lib/auth/recuperacion')
const { MENSAJE_CAPTCHA, MENSAJE_GENERICO } = await import('@/lib/errores/mapear')

function formulario(correo: string): FormData {
  const fd = new FormData()
  fd.append('correo', correo)
  return fd
}

describe('solicitarRecuperacion', () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset().mockResolvedValue({ data: {}, error: null })
    verificarTurnstile.mockReset().mockResolvedValue(true)
    vi.mocked(ipDeConfianza).mockReset().mockReturnValue('127.0.0.1')
    vi.mocked(accionBloqueada).mockReset().mockResolvedValue(false)
    vi.mocked(registrarIntentoAccion).mockReset().mockResolvedValue(true)
  })

  it('un correo invalido no llega a Supabase', async () => {
    const r = await solicitarRecuperacion({}, formulario('no-es-correo'))
    expect(r.error).toBeTruthy()
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('envia el enlace hacia la ruta de recuperacion y responde con el mensaje neutro', async () => {
    const r = await solicitarRecuperacion({}, formulario('  Ana@Ejemplo.com '))
    expect(resetPasswordForEmail).toHaveBeenCalledWith('ana@ejemplo.com', {
      redirectTo: 'http://127.0.0.1:3000/confirmar/recuperacion',
    })
    expect(registrarIntentoAccion).toHaveBeenCalledWith('recuperar', 'ana@ejemplo.com', '127.0.0.1', true)
    expect(r).toEqual({ enviado: true, mensaje: MENSAJE_RECUPERACION_ENVIADA })
  })

  it('un correo sin cuenta responde lo mismo: no enumera cuentas', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: null, error: { code: 'user_not_found' } })
    const r = await solicitarRecuperacion({}, formulario('nadie@ejemplo.com'))
    expect(r).toEqual({ enviado: true, mensaje: MENSAJE_RECUPERACION_ENVIADA })
  })

  it('con la ventana agotada no envia nada, pero tampoco lo delata', async () => {
    vi.mocked(accionBloqueada).mockResolvedValue(true)
    const r = await solicitarRecuperacion({}, formulario('ana@ejemplo.com'))
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
    expect(r).toEqual({ enviado: true, mensaje: MENSAJE_RECUPERACION_ENVIADA })
  })

  it('un captcha fallido se rechaza antes de Supabase', async () => {
    verificarTurnstile.mockResolvedValue(false)
    const r = await solicitarRecuperacion({}, formulario('ana@ejemplo.com'))
    expect(r.error).toBe(MENSAJE_CAPTCHA)
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('si el intento no se puede contabilizar se falla cerrado', async () => {
    vi.mocked(registrarIntentoAccion).mockResolvedValue(false)
    const r = await solicitarRecuperacion({}, formulario('ana@ejemplo.com'))
    expect(r.error).toBe(MENSAJE_GENERICO)
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })
})
