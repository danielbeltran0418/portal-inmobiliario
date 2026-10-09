import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const accesoAdmin = vi.fn()
const accionBloqueada = vi.fn()
const registrarIntentoAccion = vi.fn()
const listFactors = vi.fn()
const enroll = vi.fn()
const unenroll = vi.fn()
const challengeAndVerify = vi.fn()
const redirect = vi.fn((destino: string) => { throw new Error(`REDIRECT:${destino}`) })

const cliente = { auth: { mfa: { listFactors, enroll, unenroll, challengeAndVerify } } }

vi.mock('@/lib/auth/admin', () => ({ accesoAdmin }))
vi.mock('@/lib/auth/limite-intentos', () => ({ accionBloqueada, registrarIntentoAccion }))
vi.mock('@/lib/http/ip-cliente', () => ({ ipDeConfianza: () => '127.0.0.1' }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({ redirect }))

const { iniciarAlta, verificarCodigo } = await import('@/app/(auth)/doble-factor/acciones')

function formulario(codigo: string, factorId = 'f1'): FormData {
  const fd = new FormData()
  fd.append('factor_id', factorId)
  fd.append('codigo', codigo)
  return fd
}

beforeEach(() => {
  accesoAdmin.mockReset().mockResolvedValue({ estado: 'falta_mfa', cliente, adminId: 'u1' })
  accionBloqueada.mockReset().mockResolvedValue(false)
  registrarIntentoAccion.mockReset().mockResolvedValue(true)
  listFactors.mockReset().mockResolvedValue({ data: { all: [], totp: [] }, error: null })
  enroll.mockReset().mockResolvedValue({
    data: { id: 'f-nuevo', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABC', uri: 'otpauth://x' } },
    error: null,
  })
  unenroll.mockReset().mockResolvedValue({ error: null })
  challengeAndVerify.mockReset().mockResolvedValue({ data: {}, error: null })
  redirect.mockClear()
})

describe('iniciarAlta', () => {
  it('da de alta un TOTP y devuelve QR y secreto', async () => {
    const r = await iniciarAlta()
    expect(r).toEqual({ factorId: 'f-nuevo', qr: 'data:image/svg+xml;utf-8,<svg/>', secreto: 'ABC' })
    expect(enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: 'totp' }))
  })

  it('borra antes los factores sin verificar de intentos anteriores', async () => {
    listFactors.mockResolvedValue({ data: { all: [{ id: 'viejo', status: 'unverified' }], totp: [] }, error: null })
    await iniciarAlta()
    expect(unenroll).toHaveBeenCalledWith({ factorId: 'viejo' })
  })

  it('con un factor ya verificado no deja registrar otro dispositivo', async () => {
    listFactors.mockResolvedValue({ data: { all: [{ id: 'f1', status: 'verified' }], totp: [{ id: 'f1' }] }, error: null })
    const r = await iniciarAlta()
    expect(r.error).toBeTruthy()
    expect(enroll).not.toHaveBeenCalled()
  })

  it('quien no es super_admin no llega a Supabase', async () => {
    accesoAdmin.mockResolvedValue({ estado: 'no_admin' })
    await expect(iniciarAlta()).rejects.toThrow('REDIRECT:/login')
    expect(enroll).not.toHaveBeenCalled()
  })
})

describe('verificarCodigo', () => {
  it('con un codigo valido registra el exito y entra al panel', async () => {
    await expect(verificarCodigo({}, formulario('123 456'))).rejects.toThrow('REDIRECT:/control')
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' })
    expect(registrarIntentoAccion).toHaveBeenCalledWith('mfa', 'u1', '127.0.0.1', true)
  })

  it('un codigo incorrecto cuenta como fallo y no redirige', async () => {
    challengeAndVerify.mockResolvedValue({ data: null, error: { code: 'mfa_verification_failed' } })
    const r = await verificarCodigo({}, formulario('000000'))
    expect(r.error).toBeTruthy()
    expect(registrarIntentoAccion).toHaveBeenCalledWith('mfa', 'u1', '127.0.0.1', false)
  })

  it('bloqueado por intentos no consulta a Supabase', async () => {
    accionBloqueada.mockResolvedValue(true)
    const r = await verificarCodigo({}, formulario('123456'))
    expect(r.error).toMatch(/15 minutos/)
    expect(challengeAndVerify).not.toHaveBeenCalled()
  })

  it('rechaza lo que no son 6 digitos sin gastar intento', async () => {
    const r = await verificarCodigo({}, formulario('12ab56'))
    expect(r.error).toBeTruthy()
    expect(accionBloqueada).not.toHaveBeenCalled()
    expect(challengeAndVerify).not.toHaveBeenCalled()
  })

  it('si no se pudo registrar el fallo, responde como bloqueado (falla cerrado)', async () => {
    challengeAndVerify.mockResolvedValue({ data: null, error: { code: 'x' } })
    registrarIntentoAccion.mockResolvedValue(false)
    const r = await verificarCodigo({}, formulario('000000'))
    expect(r.error).toMatch(/15 minutos/)
  })
})
