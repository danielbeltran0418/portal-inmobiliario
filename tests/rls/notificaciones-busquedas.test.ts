import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAnonimo, clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const COMPRADOR = { correo: `comp-notif-${Date.now()}@prueba.test`, password: 'ClaveDePrueba123!' }

describe('RLS: token_baja de busquedas_guardadas', () => {
  let clienteComprador: SupabaseClient
  let compradorId: string
  let busquedaId: string
  let tokenBaja: string
  const anonimo = clienteAnonimo()

  beforeAll(async () => {
    compradorId = await crearUsuarioDePrueba({ ...COMPRADOR, rol: 'comprador' })
    clienteComprador = await clienteComo(COMPRADOR.correo, COMPRADOR.password)

    const { data, error } = await clienteComprador
      .from('busquedas_guardadas')
      .insert({
        usuario_id: compradorId,
        nombre: 'Busqueda para prueba de baja',
        filtros: { barrio: 'riomar' },
        notificaciones_activas: true,
      })
      .select('id, token_baja')
      .single()

    if (error || !data) throw error ?? new Error('No se pudo crear busqueda de prueba')
    busquedaId = data.id
    tokenBaja = data.token_baja
  })

  it('el comprador dueño puede leer su propio token_baja (ya cubierto por RLS de SP2, control positivo)', async () => {
    const { data, error } = await clienteComprador
      .from('busquedas_guardadas')
      .select('token_baja')
      .eq('id', busquedaId)
      .single()

    expect(error).toBeNull()
    expect(data?.token_baja).toBe(tokenBaja)
  })

  it('un usuario anonimo no puede leer busquedas_guardadas por token_baja via la API REST directa', async () => {
    const { data, error } = await anonimo
      .from('busquedas_guardadas')
      .select('id')
      .eq('token_baja', tokenBaja)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('FALSIFICACIÓN: el cliente admin (usado por la ruta de baja) SÍ puede desactivar por token_baja sin sesión de usuario', async () => {
    const admin = clienteAdmin()
    const { data, error } = await admin
      .from('busquedas_guardadas')
      .update({ notificaciones_activas: false })
      .eq('token_baja', tokenBaja)
      .select('notificaciones_activas')
      .single()

    expect(error).toBeNull()
    expect(data?.notificaciones_activas).toBe(false)
  })

  it('un token_baja inexistente no afecta ninguna fila', async () => {
    const admin = clienteAdmin()
    const { data, error } = await admin
      .from('busquedas_guardadas')
      .update({ notificaciones_activas: false })
      .eq('token_baja', '00000000-0000-0000-0000-000000000000')
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})
