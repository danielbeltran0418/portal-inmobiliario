import { describe, it, expect, vi, beforeEach } from 'vitest'

const signUp = vi.fn()
vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => ({ auth: { signUp } }),
}))

const { registrarUsuario } = await import('@/app/(auth)/registro/acciones')

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
