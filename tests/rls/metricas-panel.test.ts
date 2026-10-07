import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAnonimo, clienteComo, crearUsuarioDePrueba, sesionVendedor } from './ayudantes'

const SUPER_ADMIN = { correo: `metricas-admin-${Date.now()}@prueba.test`, password: 'ClaveDePrueba123!' }

describe('metricas_panel_control (migracion 20261010000200)', () => {
  let admin: SupabaseClient
  let vendedor: SupabaseClient

  beforeAll(async () => {
    await crearUsuarioDePrueba({ ...SUPER_ADMIN, rol: 'super_admin' })
    admin = await clienteComo(SUPER_ADMIN.correo, SUPER_ADMIN.password)
    vendedor = await sesionVendedor()
  })

  it('el super admin recibe los agregados de todas las secciones', async () => {
    const { data, error } = await admin.rpc('metricas_panel_control')
    expect(error).toBeNull()
    for (const seccion of ['propiedades', 'leads', 'citas', 'posicionamiento', 'conversaciones', 'mensajes']) {
      expect(data).toHaveProperty(seccion)
    }
    expect(typeof data.mensajes.total).toBe('number')
    expect(data.citas).toHaveProperty('realizadas')
  })

  it('un vendedor no puede consultarla', async () => {
    const { error } = await vendedor.rpc('metricas_panel_control')
    expect(error?.code).toBe('42501')
  })

  it('anon tampoco', async () => {
    const { error } = await clienteAnonimo().rpc('metricas_panel_control')
    expect(error).not.toBeNull()
  })
})
