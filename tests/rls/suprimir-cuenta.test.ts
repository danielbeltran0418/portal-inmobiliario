import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, clienteComo, crearUsuarioDePrueba, sesionVendedor } from './ayudantes'

// CN-006 (auditoria Cyber Neo 2026-10-06). suprimirCuentaCompradorAction
// ignoraba el error de cada paso y, si auth.admin.deleteUser fallaba, solo
// hacia console.warn y devolvia exito: true: el titular creia ejercido su
// derecho al olvido con la cuenta todavia viva.
//
// crearClienteServidor depende de cookies() de Next: se sustituye por el
// cliente autenticado de cada prueba, igual que en cambiar-estado.test.ts.
// crearClienteAdmin es el REAL salvo en la prueba de fallo, donde solo
// deleteUser se reemplaza por uno que falla.
let clienteActual: SupabaseClient
let deleteUserFalla = false

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => clienteActual,
}))
vi.mock('@/lib/supabase/cliente-admin', async () => {
  const { clienteAdmin: real } = await import('./ayudantes')
  return {
    crearClienteAdmin: () => {
      const admin = real()
      if (deleteUserFalla) {
        admin.auth.admin.deleteUser = async () => ({
          data: { user: null },
          error: Object.assign(new Error('fallo simulado de Auth'), { status: 500 }),
        }) as never
      }
      return admin
    },
  }
})
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { suprimirCuentaCompradorAction } = await import('@/lib/comprador/acciones-datos')

const CONFIRMACION = 'ELIMINAR MI CUENTA'

describe('suprimirCuentaCompradorAction (CN-006)', () => {
  let vendedor: SupabaseClient
  let vendedorId: string
  let propiedadId: string

  beforeAll(async () => {
    vendedor = await sesionVendedor()
    const { data: u } = await vendedor.auth.getUser()
    vendedorId = u.user!.id

    const { data, error } = await vendedor
      .from('propiedades')
      .insert({
        vendedor_id: vendedorId,
        titulo: 'Propiedad para probar la supresion de cuenta',
        descripcion: 'Descripcion de prueba para la supresion.',
        slug: `supresion-${randomUUID().replace(/[^a-f]/g, '')}`,
        operacion: 'venta',
        tipo_inmueble: 'apartamento',
        precio: 210000000,
        estado: 'borrador',
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    propiedadId = data!.id as string
  })

  afterAll(async () => {
    deleteUserFalla = false
    if (propiedadId) await clienteAdmin().from('propiedades').delete().eq('id', propiedadId)
  })

  // Comprador con un lead (y su contacto) y un favorito sobre la propiedad.
  async function compradorConDatos(): Promise<{ cliente: SupabaseClient; id: string; leadId: string }> {
    const correo = `supresion-${randomUUID()}@prueba.test`
    const password = 'ClaveDePrueba123!'
    const id = await crearUsuarioDePrueba({ correo, password, rol: 'comprador' })
    const cliente = await clienteComo(correo, password)

    const admin = clienteAdmin()
    const { data: lead, error: errLead } = await admin
      .from('leads')
      .insert({
        propiedad_id: propiedadId,
        comprador_id: id,
        vendedor_id: vendedorId,
        nombre_mostrado: 'Comprador de prueba',
        mensaje: 'Mensaje de prueba para la supresion de cuenta.',
      })
      .select('id')
      .single()
    expect(errLead).toBeNull()
    const { error: errContacto } = await admin
      .from('leads_contacto')
      .insert({ lead_id: lead!.id, correo, telefono: '3001234567' })
    expect(errContacto).toBeNull()
    const { error: errFav } = await admin
      .from('favoritos')
      .insert({ usuario_id: id, propiedad_id: propiedadId })
    expect(errFav).toBeNull()

    return { cliente, id, leadId: lead!.id as string }
  }

  // Eventos 'cuenta_suprimida' sobre esa cuenta. registro_auditoria no tiene
  // FK en entidad_id, asi que el rastro sobrevive al borrado del usuario.
  async function eventosDeSupresion(id: string) {
    const { data, error } = await clienteAdmin()
      .from('registro_auditoria')
      .select('accion, actor_id')
      .eq('accion', 'cuenta_suprimida')
      .eq('entidad_id', id)
    expect(error).toBeNull()
    return data!
  }

  async function restos(id: string, leadId: string) {
    const admin = clienteAdmin()
    const [auth, perfil, lead, contacto, favoritos] = await Promise.all([
      admin.auth.admin.getUserById(id),
      admin.from('perfiles').select('id').eq('id', id),
      admin.from('leads').select('id').eq('id', leadId),
      admin.from('leads_contacto').select('lead_id').eq('lead_id', leadId),
      admin.from('favoritos').select('id').eq('usuario_id', id),
    ])
    return {
      cuentaAuth: auth.data.user !== null,
      perfil: perfil.data!.length,
      lead: lead.data!.length,
      contacto: contacto.data!.length,
      favoritos: favoritos.data!.length,
    }
  }

  it('borra la cuenta y todos sus datos personales', async () => {
    const { cliente, id, leadId } = await compradorConDatos()
    clienteActual = cliente

    // Positivo previo: los datos existen antes de la accion.
    expect(await restos(id, leadId)).toEqual({ cuentaAuth: true, perfil: 1, lead: 1, contacto: 1, favoritos: 1 })

    const r = await suprimirCuentaCompradorAction(CONFIRMACION)

    expect(r).toEqual({ exito: true })
    expect(await restos(id, leadId)).toEqual({ cuentaAuth: false, perfil: 0, lead: 0, contacto: 0, favoritos: 0 })

    // La traza perdura, sin vinculo a una cuenta que ya no existe.
    const eventos = await eventosDeSupresion(id)
    expect(eventos).toHaveLength(1)
    expect(eventos[0].actor_id).toBeNull()
  })

  it('si Auth no borra la cuenta, NO dice exito y no deja la cuenta a medio borrar', async () => {
    const { cliente, id, leadId } = await compradorConDatos()
    clienteActual = cliente
    deleteUserFalla = true

    try {
      const r = await suprimirCuentaCompradorAction(CONFIRMACION)

      expect(r.exito).toBe(false)
      expect(r.error).toBeTruthy()
      // Nada se toco: el titular puede reintentar y sigue viendo sus datos.
      expect(await restos(id, leadId)).toEqual({ cuentaAuth: true, perfil: 1, lead: 1, contacto: 1, favoritos: 1 })
      const { data: perfil } = await clienteAdmin()
        .from('perfiles').select('nombre, suprimido_en').eq('id', id).single()
      expect(perfil!.suprimido_en).toBeNull()
      // registro_auditoria es inmutable: si la cuenta sigue viva, no puede
      // existir un evento que diga que fue suprimida.
      expect(await eventosDeSupresion(id)).toHaveLength(0)
    } finally {
      deleteUserFalla = false
      await clienteAdmin().auth.admin.deleteUser(id)
    }
  })

  it('un vendedor no puede usar la supresion del comprador', async () => {
    const otroVendedor = await sesionVendedor()
    clienteActual = otroVendedor
    const { data: u } = await otroVendedor.auth.getUser()

    const r = await suprimirCuentaCompradorAction(CONFIRMACION)

    expect(r.exito).toBe(false)
    const { data } = await clienteAdmin().auth.admin.getUserById(u.user!.id)
    expect(data.user).not.toBeNull()
    await clienteAdmin().auth.admin.deleteUser(u.user!.id)
  })
})
