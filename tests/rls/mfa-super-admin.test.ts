import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

// Hallazgo M2 de la auditoria (20261014000100_mfa_super_admin.sql): el
// super_admin necesita una sesion aal2. Con solo la contrasena, frente a la
// base es un usuario cualquiera -- tambien llamando a PostgREST directo.
const ADMIN = { correo: `mfa-admin-${randomUUID()}@prueba.test`, password: 'ClaveDePrueba123!' }
const OTRO = { correo: `mfa-otro-${randomUUID()}@prueba.test`, password: 'ClaveDePrueba123!' }

const admin = clienteAdmin()
let idOtro = ''
let soloContrasena: SupabaseClient

beforeAll(async () => {
  await crearUsuarioDePrueba({ ...ADMIN, rol: 'super_admin' })
  idOtro = await crearUsuarioDePrueba({ ...OTRO, rol: 'comprador' })
  // Primero la sesion aal1: al verificar un factor nuevo, Supabase Auth cierra
  // las demas sesiones aal1 del usuario, y esta prueba la necesita viva.
  soloContrasena = await clienteComo(ADMIN.correo, ADMIN.password, { segundoFactor: false })
})

describe('M2: el super_admin sin segundo factor no tiene privilegios', () => {
  it('su token es aal1', async () => {
    const { data } = await soloContrasena.auth.mfa.getAuthenticatorAssuranceLevel()
    expect(data?.currentLevel).toBe('aal1')
  })

  it('es_super_admin() devuelve false', async () => {
    const { data, error } = await soloContrasena.rpc('es_super_admin')
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('no lee perfiles ajenos', async () => {
    const { data } = await soloContrasena.from('perfiles').select('id').eq('id', idOtro)
    expect(data).toHaveLength(0)
  })

  it('no lee el registro de auditoria', async () => {
    const { data } = await soloContrasena.from('registro_auditoria').select('id').limit(1)
    expect(data).toHaveLength(0)
  })

  it('sigue leyendo su propio perfil (lo necesita la pantalla de doble factor)', async () => {
    const { data } = await soloContrasena.from('perfiles').select('rol')
    expect(data).toEqual([{ rol: 'super_admin' }])
  })
})

describe('M2: con el segundo factor recupera sus privilegios', () => {
  it('aal2: es_super_admin() true y lee perfiles ajenos', async () => {
    const conFactor = await clienteComo(ADMIN.correo, ADMIN.password)

    const { data: nivel } = await conFactor.auth.mfa.getAuthenticatorAssuranceLevel()
    expect(nivel?.currentLevel).toBe('aal2')

    const { data: esAdmin } = await conFactor.rpc('es_super_admin')
    expect(esAdmin).toBe(true)

    const { data } = await conFactor.from('perfiles').select('id').eq('id', idOtro)
    expect(data).toHaveLength(1)
  })
})

describe('M2: limite de codigos de segundo factor', () => {
  const clave = randomUUID()
  const IP = '203.0.113.77'

  it('bloquea al quinto fallo, sin importar la IP, y lo audita', async () => {
    for (let i = 0; i < 4; i++) {
      await admin.rpc('registrar_intento_accion', { p_accion: 'mfa', p_clave: clave, p_ip: IP, p_exitoso: false })
    }
    const { data: conCuatro } = await admin.rpc('accion_bloqueada', { p_accion: 'mfa', p_clave: clave, p_ip: IP })
    expect(conCuatro).toBe(false)

    // El quinto llega desde otra IP: rotar de IP no da intentos nuevos.
    await admin.rpc('registrar_intento_accion', { p_accion: 'mfa', p_clave: clave, p_ip: '198.51.100.9', p_exitoso: false })
    const { data: conCinco } = await admin.rpc('accion_bloqueada', { p_accion: 'mfa', p_clave: clave, p_ip: IP })
    expect(conCinco).toBe(true)

    const { data: fallidos } = await admin.from('registro_auditoria')
      .select('id').eq('accion', 'mfa_fallido').eq('entidad', 'sesion').gte('creado_en', new Date(Date.now() - 60_000).toISOString())
    expect((fallidos ?? []).length).toBeGreaterThanOrEqual(5)
  })

  it('un exito limpia los fallos', async () => {
    const otraClave = randomUUID()
    for (let i = 0; i < 5; i++) {
      await admin.rpc('registrar_intento_accion', { p_accion: 'mfa', p_clave: otraClave, p_ip: IP, p_exitoso: false })
    }
    await admin.rpc('registrar_intento_accion', { p_accion: 'mfa', p_clave: otraClave, p_ip: IP, p_exitoso: true })
    const { data } = await admin.rpc('accion_bloqueada', { p_accion: 'mfa', p_clave: otraClave, p_ip: IP })
    expect(data).toBe(false)
  })
})
