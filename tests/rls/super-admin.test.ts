import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, clienteAnonimo, clienteComo, crearUsuarioDePrueba, sesionVendedor } from './ayudantes'

const COMPRADOR = { correo: `sa-comprador-${Date.now()}@prueba.test`, password: 'ClaveDePrueba123!' }
const SUPER_ADMIN = { correo: `sa-admin-${Date.now()}@prueba.test`, password: 'ClaveDePrueba123!' }

describe('RLS y Autorización para Super Admin y Moderación', () => {
  let clienteVendedorA: SupabaseClient
  let clienteVendedorB: SupabaseClient
  let clienteComprador: SupabaseClient
  let clienteSuperAdmin: SupabaseClient
  let vendedorAId: string
  let propiedadAId: string

  beforeAll(async () => {
    clienteVendedorA = await sesionVendedor()
    clienteVendedorB = await sesionVendedor()
    const { data: uA } = await clienteVendedorA.auth.getUser()
    vendedorAId = uA.user!.id

    await crearUsuarioDePrueba({ ...COMPRADOR, rol: 'comprador' })
    await crearUsuarioDePrueba({ ...SUPER_ADMIN, rol: 'super_admin' })

    clienteComprador = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    clienteSuperAdmin = await clienteComo(SUPER_ADMIN.correo, SUPER_ADMIN.password)

    // Crear una propiedad de prueba para el vendedor A como borrador
    const { data: propA, error: errA } = await clienteVendedorA
      .from('propiedades')
      .insert({
        vendedor_id: vendedorAId,
        titulo: 'Propiedad para Moderación Super Admin',
        descripcion: 'Descripcion de prueba para permisos administrativos.',
        slug: `propiedad-sa-${Date.now().toString(36)}`,
        operacion: 'venta',
        tipo_inmueble: 'apartamento',
        precio: 350000000,
        estado: 'borrador',
      })
      .select('id')
      .single()

    expect(errA).toBeNull()
    propiedadAId = propA!.id

    // Insertar imagen requerida para publicar
    const { error: errImg } = await clienteAdmin()
      .from('imagenes_propiedad')
      .insert({
        propiedad_id: propiedadAId,
        ruta_storage: `${vendedorAId}/${propiedadAId}/foto.webp`,
        alt_text: 'Foto de prueba',
        orden: 0,
      })
    expect(errImg).toBeNull()

    // Publicar la propiedad
    const { error: errPub } = await clienteVendedorA
      .from('propiedades')
      .update({ estado: 'publicada' })
      .eq('id', propiedadAId)
    expect(errPub).toBeNull()
  })

  afterAll(async () => {
    if (propiedadAId) {
      await clienteAdmin().from('propiedades').delete().eq('id', propiedadAId)
    }
  })

  it('el comprador NO puede actualizar ni rechazar propiedades ajenas', async () => {
    const { data, error } = await clienteComprador
      .from('propiedades')
      .update({ estado: 'rechazada' })
      .eq('id', propiedadAId)
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(0)

    // Verificar que la propiedad sigue intacta
    const { data: propIntacta } = await clienteAdmin()
      .from('propiedades')
      .select('estado')
      .eq('id', propiedadAId)
      .single()
    expect(propIntacta?.estado).toBe('publicada')
  })

  it('el vendedor B NO puede actualizar ni rechazar la propiedad del vendedor A', async () => {
    const { data, error } = await clienteVendedorB
      .from('propiedades')
      .update({ estado: 'rechazada' })
      .eq('id', propiedadAId)
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(0)

    const { data: propIntacta } = await clienteAdmin()
      .from('propiedades')
      .select('estado')
      .eq('id', propiedadAId)
      .single()
    expect(propIntacta?.estado).toBe('publicada')
  })

  it('el comprador y vendedor B NO pueden eliminar la propiedad del vendedor A', async () => {
    const { data: dataComp, error: errComp } = await clienteComprador
      .from('propiedades')
      .delete()
      .eq('id', propiedadAId)
      .select('id')

    expect(errComp).toBeNull()
    expect(dataComp).toHaveLength(0)

    const { data: dataVendB, error: errVendB } = await clienteVendedorB
      .from('propiedades')
      .delete()
      .eq('id', propiedadAId)
      .select('id')

    expect(errVendB).toBeNull()
    expect(dataVendB).toHaveLength(0)
  })

  it('el super_admin SI puede actualizar el estado de cualquier propiedad (moderación)', async () => {
    const { data, error } = await clienteSuperAdmin
      .from('propiedades')
      .update({ estado: 'rechazada' })
      .eq('id', propiedadAId)
      .select('id, estado')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].estado).toBe('rechazada')

    // Restaurar a publicada para siguientes pruebas
    await clienteSuperAdmin
      .from('propiedades')
      .update({ estado: 'publicada' })
      .eq('id', propiedadAId)
  })

  it('el super_admin SI puede eliminar cualquier propiedad mediante la nueva política de borrado', async () => {
    // Crear propiedad efímera para probar borrado
    const { data: efimera, error: errCrear } = await clienteVendedorA
      .from('propiedades')
      .insert({
        vendedor_id: vendedorAId,
        titulo: 'Propiedad Efimera para Borrado por Super Admin',
        descripcion: 'Prueba borrado super admin.',
        slug: `borrado-sa-${Date.now().toString(36)}`,
        operacion: 'venta',
        tipo_inmueble: 'casa',
        precio: 200000000,
        estado: 'borrador',
      })
      .select('id')
      .single()

    expect(errCrear).toBeNull()
    const efimeraId = efimera!.id

    const { data: dataBorrado, error: errBorrado } = await clienteSuperAdmin
      .from('propiedades')
      .delete()
      .eq('id', efimeraId)
      .select('id')

    expect(errBorrado).toBeNull()
    expect(dataBorrado).toHaveLength(1)

    // Confirmar que ya no existe
    const { data: check } = await clienteAdmin()
      .from('propiedades')
      .select('id')
      .eq('id', efimeraId)
    expect(check).toHaveLength(0)
  })

  it('el usuario anónimo no tiene permisos de lectura ni escritura sobre pagos_posicionamiento', async () => {
    const anon = clienteAnonimo()
    const { error: errPago } = await anon
      .from('pagos_posicionamiento')
      .select('id')
    expect(errPago?.code).toBe('42501')
  })
})
