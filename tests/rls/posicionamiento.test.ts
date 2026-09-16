import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba, sesionVendedor } from './ayudantes'

const COMPRADOR = { correo: `pos-comprador-${Date.now()}@prueba.test`, password: 'ClaveDePrueba123!' }
const SUPER_ADMIN = { correo: `pos-admin-${Date.now()}@prueba.test`, password: 'ClaveDePrueba123!' }

describe('RLS y Vigencia de Pagos de Posicionamiento (SP7)', () => {
  let clienteVendedorA: SupabaseClient
  let clienteVendedorB: SupabaseClient
  let clienteComprador: SupabaseClient
  let clienteSuperAdmin: SupabaseClient
  let vendedorAId: string
  let vendedorBId: string
  let compradorId: string
  let superAdminId: string
  let propiedadAId: string

  beforeAll(async () => {
    clienteVendedorA = await sesionVendedor()
    clienteVendedorB = await sesionVendedor()
    const { data: uA } = await clienteVendedorA.auth.getUser()
    const { data: uB } = await clienteVendedorB.auth.getUser()
    vendedorAId = uA.user!.id
    vendedorBId = uB.user!.id

    compradorId = await crearUsuarioDePrueba({ ...COMPRADOR, rol: 'comprador' })
    superAdminId = await crearUsuarioDePrueba({ ...SUPER_ADMIN, rol: 'super_admin' })

    clienteComprador = await clienteComo(COMPRADOR.correo, COMPRADOR.password)
    clienteSuperAdmin = await clienteComo(SUPER_ADMIN.correo, SUPER_ADMIN.password)

    // Crear propiedad para el vendedor A como borrador
    const { data: propA, error: errA } = await clienteVendedorA
      .from('propiedades')
      .insert({
        vendedor_id: vendedorAId,
        titulo: 'Propiedad para Posicionamiento Destacado',
        descripcion: 'Propiedad con acuerdo pagado de visibilidad.',
        slug: `propiedad-pos-${Date.now().toString(36)}`,
        operacion: 'venta',
        tipo_inmueble: 'casa',
        precio: 450000000,
        estado: 'borrador',
        destacada: false,
      })
      .select('id')
      .single()

    expect(errA).toBeNull()
    propiedadAId = propA!.id

    // Insertar imagen
    const { error: errImg } = await clienteAdmin()
      .from('imagenes_propiedad')
      .insert({
        propiedad_id: propiedadAId,
        ruta_storage: `${vendedorAId}/${propiedadAId}/foto.webp`,
        alt_text: 'Foto para posicionamiento',
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

  it('el vendedor NO puede registrar acuerdos de posicionamiento directamente (42501)', async () => {
    const ahora = new Date()
    const fin = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { error } = await clienteVendedorA
      .from('pagos_posicionamiento')
      .insert({
        propiedad_id: propiedadAId,
        vendedor_id: vendedorAId,
        monto: 50000,
        moneda: 'COP',
        fecha_inicio: ahora.toISOString(),
        fecha_fin: fin.toISOString(),
        estado: 'activo',
        registrado_por: vendedorAId,
      })

    expect(error?.code).toBe('42501')
  })

  it('el comprador NO puede leer acuerdos de posicionamiento (RLS retorna 0 filas)', async () => {
    const { data, error } = await clienteComprador
      .from('pagos_posicionamiento')
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('el comprador NO puede registrar acuerdos de posicionamiento (42501)', async () => {
    const ahora = new Date()
    const fin = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { error } = await clienteComprador
      .from('pagos_posicionamiento')
      .insert({
        propiedad_id: propiedadAId,
        vendedor_id: vendedorAId,
        monto: 50000,
        moneda: 'COP',
        fecha_inicio: ahora.toISOString(),
        fecha_fin: fin.toISOString(),
        estado: 'activo',
        registrado_por: compradorId,
      })

    expect(error?.code).toBe('42501')
  })

  it('falsificación CHECK constraint: rechaza fecha_fin menor o igual a fecha_inicio (23514)', async () => {
    const ahora = new Date()
    const fechaInvalida = new Date(ahora.getTime() - 3600 * 1000) // 1 hora en el pasado

    const { error } = await clienteSuperAdmin
      .from('pagos_posicionamiento')
      .insert({
        propiedad_id: propiedadAId,
        vendedor_id: vendedorAId,
        monto: 75000,
        moneda: 'COP',
        fecha_inicio: ahora.toISOString(),
        fecha_fin: fechaInvalida.toISOString(),
        estado: 'activo',
        registrado_por: superAdminId,
      })

    expect(error?.code).toBe('23514')
  })

  it('super_admin registra acuerdo activo y el trigger sincroniza destacada = true', async () => {
    const inicio = new Date(Date.now() - 60 * 1000) // Hace 1 minuto
    const fin = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) // 5 días

    const { data: acuerdo, error: errAcuerdo } = await clienteSuperAdmin
      .from('pagos_posicionamiento')
      .insert({
        propiedad_id: propiedadAId,
        vendedor_id: vendedorAId,
        monto: 100000,
        moneda: 'COP',
        fecha_inicio: inicio.toISOString(),
        fecha_fin: fin.toISOString(),
        estado: 'activo',
        registrado_por: superAdminId,
        notas: 'Acuerdo promocional pagado vía transferencia',
      })
      .select('id')
      .single()

    expect(errAcuerdo).toBeNull()
    const acuerdoId = acuerdo!.id

    // Verificar que la propiedad ahora es destacada = true
    const { data: propActualizada } = await clienteAdmin()
      .from('propiedades')
      .select('destacada')
      .eq('id', propiedadAId)
      .single()

    expect(propActualizada?.destacada).toBe(true)

    // Verificar que el vendedor A SI puede leer su propio acuerdo
    const { data: dataVendA, error: errVendA } = await clienteVendedorA
      .from('pagos_posicionamiento')
      .select('id, monto')
      .eq('id', acuerdoId)

    expect(errVendA).toBeNull()
    expect(dataVendA).toHaveLength(1)

    // Verificar que el vendedor B NO puede leer el acuerdo del vendedor A
    const { data: dataVendB, error: errVendB } = await clienteVendedorB
      .from('pagos_posicionamiento')
      .select('id')
      .eq('id', acuerdoId)

    expect(errVendB).toBeNull()
    expect(dataVendB).toHaveLength(0)

    // Al cancelar el acuerdo, el trigger sincroniza y destacada vuelve a false
    const { error: errCancel } = await clienteSuperAdmin
      .from('pagos_posicionamiento')
      .update({ estado: 'cancelado' })
      .eq('id', acuerdoId)

    expect(errCancel).toBeNull()

    const { data: propDesmarcada } = await clienteAdmin()
      .from('propiedades')
      .select('destacada')
      .eq('id', propiedadAId)
      .single()

    expect(propDesmarcada?.destacada).toBe(false)
  })
})
