import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, sesionVendedor } from './ayudantes'

// actualizarPropiedad() depende de crearClienteServidor() (cookies() de
// next/headers, solo resuelve dentro de una peticion real de Next). Se
// sustituye por un cliente autenticado real, igual que
// tests/rls/eliminar-propiedad.test.ts. acciones.ts tambien importa
// crearClienteAdmin (para drenarLimpieza, que esta prueba no ejercita): se
// mockea igual, o la sola importacion del modulo revienta bajo Vitest/Node
// por el 'server-only' de cliente-admin.ts.
let clienteActual: SupabaseClient

vi.mock('@/lib/supabase/cliente-servidor', () => ({
  crearClienteServidor: async () => clienteActual,
}))
vi.mock('@/lib/supabase/cliente-admin', () => ({
  crearClienteAdmin: () => clienteAdmin(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { actualizarPropiedad } = await import('@/app/(vendedor)/panel/propiedades/acciones')

async function crearBorradorSinPrecio(cliente: SupabaseClient, vendedorId: string) {
  const { data, error } = await cliente
    .from('propiedades')
    .insert({
      vendedor_id: vendedorId,
      titulo: 'Casa de prueba para guardar sin precio',
      // descripcion vacia, como nace un borrador real via crearBorrador():
      // '' se distingue de la descripcion nueva que se va a guardar en el
      // UPDATE de mas abajo.
      descripcion: '',
      slug: `prueba-sin-precio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      operacion: 'venta',
      tipo_inmueble: 'casa',
      // precio se omite: igual que crearBorrador() en produccion desde
      // 20260907000100, la columna admite NULL.
    })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data!.id as string
}

function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.append(k, v)
  return fd
}

describe('actualizarPropiedad: guardar un borrador sin precio no debe perder el resto', () => {
  it('guarda descripcion, barrio y habitaciones aunque el precio quede vacio (hoy se pierden)', async () => {
    const cliente = await sesionVendedor()
    clienteActual = cliente
    const { data: usuario } = await cliente.auth.getUser()
    const vendedorId = usuario.user!.id
    const propiedadId = await crearBorradorSinPrecio(cliente, vendedorId)

    const { data: barrio } = await clienteAdmin()
      .from('barrios').select('id').eq('slug', 'riomar').single()

    const descripcionNueva =
      'Casa amplia y luminosa, cerca de parques y colegios, recien actualizada.'

    const r = await actualizarPropiedad({}, formulario({
      id: propiedadId,
      titulo: 'Casa de prueba para guardar sin precio',
      descripcion: descripcionNueva,
      operacion: 'venta',
      tipo_inmueble: 'casa',
      // precio deliberadamente vacio: el punto entero de esta prueba.
      precio: '',
      habitaciones: '3',
      barrio_id: barrio!.id as string,
    }))

    // Antes del arreglo, esquemaPropiedad exigia precio positivo y esto
    // devolvia { errores: { precio: ... } } SIN llegar a llamar al UPDATE --
    // la descripcion, el barrio y las habitaciones recien escritas nunca se
    // guardaban, aunque fueran perfectamente validos por su cuenta.
    expect(r).toEqual({})

    const { data: enBase } = await clienteAdmin()
      .from('propiedades')
      .select('descripcion, barrio_id, habitaciones, precio')
      .eq('id', propiedadId)
      .single()

    expect(enBase!.descripcion).toBe(descripcionNueva)
    expect(enBase!.barrio_id).toBe(barrio!.id)
    expect(enBase!.habitaciones).toBe(3)
    // El precio sigue NULL: no se forzo ningun valor de marcador, y publicar
    // sin precio sigue bloqueado por el trigger propiedades_exigir_precio.
    expect(enBase!.precio).toBeNull()
  })
})
