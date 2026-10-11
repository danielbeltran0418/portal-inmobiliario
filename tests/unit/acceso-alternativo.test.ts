import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const m = vi.hoisted(() => ({ otp: vi.fn(), oauth: vi.fn(), bloqueado: vi.fn(), registrar: vi.fn(), captcha: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error('REDIRECT:'+url) } }))
vi.mock('@/lib/http/ip-cliente', () => ({ ipDeConfianza: () => '127.0.0.1' }))
vi.mock('@/lib/http/origen-peticion', () => ({ origenReal: () => 'https://portal.test' }))
vi.mock('@/lib/seguridad/turnstile', () => ({ CAMPO_TURNSTILE:'captcha', verificarTurnstile:m.captcha }))
vi.mock('@/lib/auth/limite-intentos', () => ({ accionBloqueada:m.bloqueado, registrarIntentoAccion:m.registrar }))
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor: async () => ({ auth: { signInWithOtp:m.otp, signInWithOAuth:m.oauth } }) }))
import { accesoAlternativo } from '@/components/acceso/acciones-alternativas'
function datos(metodo: string) { const fd = new FormData(); fd.set('metodo',metodo); fd.set('correo','persona@example.test'); fd.set('telefono','+573001234567'); return fd }
beforeEach(() => {
  vi.unstubAllEnvs(); vi.clearAllMocks()
  for (const flag of ['AUTH_GOOGLE_ENABLED','AUTH_APPLE_ENABLED','AUTH_MAGIC_LINK_ENABLED','AUTH_SMS_ENABLED']) vi.stubEnv(flag,'false')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://auth.test')
  m.bloqueado.mockResolvedValue(false); m.registrar.mockResolvedValue(true); m.captcha.mockResolvedValue(true); m.otp.mockResolvedValue({ error:null })
})
describe('métodos opcionales de acceso', () => {
  it.each(['google','apple','magicLink','sms'])('mantiene %s desactivado hasta configurarlo', async metodo => {
    expect(await accesoAlternativo({},datos(metodo))).toHaveProperty('error')
    expect(m.otp).not.toHaveBeenCalled(); expect(m.oauth).not.toHaveBeenCalled()
  })
  it('no crea cuentas ni revela si existe el correo', async () => {
    vi.stubEnv('AUTH_MAGIC_LINK_ENABLED','true')
    const existente = await accesoAlternativo({},datos('magicLink'))
    m.otp.mockResolvedValue({ error:{ message:'Account missing' } })
    expect(await accesoAlternativo({},datos('magicLink'))).toEqual(existente)
    expect(m.otp).toHaveBeenCalledWith(expect.objectContaining({ options: { shouldCreateUser:false, emailRedirectTo:'https://portal.test/confirmar' } }))
    expect(m.registrar.mock.invocationCallOrder[0]).toBeLessThan(m.otp.mock.invocationCallOrder[0])
  })
  it('no envía SMS si falla CAPTCHA o el registro de límites', async () => {
    vi.stubEnv('AUTH_SMS_ENABLED','true'); m.captcha.mockResolvedValue(false)
    expect(await accesoAlternativo({},datos('sms'))).toHaveProperty('error'); expect(m.otp).not.toHaveBeenCalled()
    m.captcha.mockResolvedValue(true); m.registrar.mockResolvedValue(false)
    expect(await accesoAlternativo({},datos('sms'))).toHaveProperty('error'); expect(m.otp).not.toHaveBeenCalled()
  })
  it('rechaza redirecciones OAuth fuera del proveedor configurado', async () => {
    vi.stubEnv('AUTH_GOOGLE_ENABLED','true'); m.oauth.mockResolvedValue({ data:{ url:'https://evil.test/login' },error:null })
    expect(await accesoAlternativo({},datos('google'))).toHaveProperty('error')
    m.oauth.mockResolvedValue({ data:{ url:'https://auth.test/auth/v1/authorize' },error:null })
    await expect(accesoAlternativo({},datos('google'))).rejects.toThrow('REDIRECT:https://auth.test/auth/v1/authorize')
  })
})