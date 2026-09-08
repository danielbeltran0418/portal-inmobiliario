import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAdmin, sesionVendedor } from './ayudantes'

/**
 * Aislamiento entre vendedores (Task 13, SP3): el vendedor B no puede tocar
 * nada del vendedor A. A diferencia de tests/rls/propiedades.test.ts (que usa
 * dos correos fijos y ya cubre lectura/escritura sobre la propiedad
 * PUBLICADA de A), esta suite usa sesionVendedor() -- vendedores EFIMEROS con
 * correo unico por corrida, sin depender de limpiar cuentas fijas -- y se
 * concentra en el BORRADOR de A para la lectura, por la trampa documentada
 * abajo.
 *
 * LA TRAMPA (ya costo un bloqueante en este sub-proyecto, ver el comentario
 * de "SIN filtro explicito" en propiedades.test.ts): `propiedades` tiene DOS
 * politicas SELECT permisivas para `authenticated`
 * (propiedades_lectura_dueno: vendedor_id = auth.uid();
 * propiedades_lectura_publica: estado = 'publicada'), y Postgres las combina
 * con OR. "B no ve la propiedad de A" SOLO es cierto si esa propiedad NO esta
 * publicada -- por eso la prueba de lectura usa un borrador. La segunda
 * describe de este archivo documenta el caso publicado: ahi B SI la ve (por
 * diseno, es publica) pero sigue sin poder editarla ni borrarla.
 */

let clienteA: SupabaseClient
let clienteB: SupabaseClient
let idA = ''

async function crearBorrador(titulo: string): Promise<string> {
  const { data, error } = await clienteA
    .from('propiedades')
    .insert({
      vendedor_id: idA,
      titulo,
      descripcion: 'Descripcion de prueba para el aislamiento entre vendedores.',
      slug: `aislamiento-${titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
      operacion: 'venta',
      tipo_inmueble: 'casa',
      precio: 250000000,
    })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data!.id as string
}

describe('aislamiento entre vendedores: BORRADOR de A', () => {
  let borradorDeA = ''

  beforeAll(async () => {
    clienteA = await sesionVendedor()
    clienteB = await sesionVendedor()
    const { data: usuarioA } = await clienteA.auth.getUser()
    idA = usuarioA.user!.id

    borradorDeA = await crearBorrador('Casa borrador aislamiento A')
  })

  it('el vendedor B NO ve el borrador de A (cero filas); el vendedor A SI lo ve', async () => {
    const { data: comoB, error: errorB } = await clienteB
      .from('propiedades').select('id').eq('id', borradorDeA)
    expect(errorB).toBeNull()
    expect(comoB).toHaveLength(0)

    // Caso positivo, en la misma prueba: sin el, "cero filas" seria igual de
    // cierto si la propiedad no existiera o si el fixture hubiera fallado.
    const { data: comoA, error: errorA } = await clienteA
      .from('propiedades').select('id').eq('id', borradorDeA)
    expect(errorA).toBeNull()
    expect(comoA).toHaveLength(1)
  })

  it('el vendedor B NO puede actualizar el borrador de A: cero filas y dato intacto', async () => {
    // Se encadena .select(): un UPDATE de PostgREST que no afecta filas
    // devuelve error NULO -- RLS filtra la fila antes del UPDATE, no levanta
    // una excepcion. Sin las filas devueltas, "no paso nada" y "denegado"
    // serian indistinguibles.
    const { data, error } = await clienteB
      .from('propiedades')
      .update({ titulo: 'Secuestrada por B' })
      .eq('id', borradorDeA)
      .select('id, titulo')

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)

    // Y el dato en la base sigue intacto, leido con service_role (salta RLS).
    const { data: enBase } = await clienteAdmin()
      .from('propiedades').select('titulo').eq('id', borradorDeA).single()
    expect(enBase!.titulo).toBe('Casa borrador aislamiento A')
  })

  it('el vendedor B NO puede insertar una imagen en la propiedad de A: 42501', async () => {
    const { error } = await clienteB.from('imagenes_propiedad').insert({
      propiedad_id: borradorDeA,
      ruta_storage: 'x/intruso-b.webp',
      alt_text: 'Imagen intrusa insertada por B',
    })
    expect(error?.code).toBe('42501')

    // Caso positivo: la propiedad de A sigue sin ninguna imagen -- el intento
    // de B no dejo nada, ni siquiera parcialmente.
    const { data: imagenes } = await clienteAdmin()
      .from('imagenes_propiedad').select('id').eq('propiedad_id', borradorDeA)
    expect(imagenes ?? []).toHaveLength(0)
  })

  it('el vendedor B NO puede borrar el borrador de A: cero filas y la propiedad sigue ahi', async () => {
    const { data, error } = await clienteB
      .from('propiedades').delete().eq('id', borradorDeA).select('id')

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)

    const { data: sigueAhi } = await clienteAdmin()
      .from('propiedades').select('id').eq('id', borradorDeA)
    expect(sigueAhi).toHaveLength(1)
  })
})

/**
 * Caso PUBLICADO, documentado a proposito: aqui la lectura de B YA NO es un
 * negativo. Es el otro lado de la misma trampa -- propiedades_lectura_publica
 * alcanza a `authenticated`, asi que cualquier vendedor autenticado ve
 * cualquier propiedad publicada, sea suya o no. Lo que SIGUE denegado es
 * escribir: ni propiedades_actualizacion_dueno ni propiedades_borrado_dueno
 * conceden nada sobre una fila que no es de B.
 */
describe('aislamiento entre vendedores: propiedad PUBLICADA de A', () => {
  let publicadaDeA = ''

  beforeAll(async () => {
    publicadaDeA = await crearBorrador('Casa publicada aislamiento A')

    const admin = clienteAdmin()
    const { error: errorImagen } = await admin.from('imagenes_propiedad').insert({
      propiedad_id: publicadaDeA,
      ruta_storage: 'fixtures/aislamiento-publicada.webp',
      alt_text: 'Fachada de prueba para publicar',
    })
    expect(errorImagen).toBeNull()

    // Se publica con el cliente de A (dueno): ejercita la misma RLS de
    // escritura que usaria el panel real, no un atajo de service_role.
    const { error: errorPublicar } = await clienteA
      .from('propiedades').update({ estado: 'publicada' }).eq('id', publicadaDeA)
    expect(errorPublicar).toBeNull()
  })

  it('por diseno, el vendedor B SI ve la publicada de A (OR de las dos politicas SELECT)', async () => {
    const { data, error } = await clienteB
      .from('propiedades').select('id, estado').eq('id', publicadaDeA)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]!.estado).toBe('publicada')
  })

  it('pero el vendedor B NO puede editar la publicada de A: cero filas y dato intacto', async () => {
    const { data, error } = await clienteB
      .from('propiedades')
      .update({ titulo: 'Secuestrada por B' })
      .eq('id', publicadaDeA)
      .select('id, titulo')

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)

    const { data: enBase } = await clienteAdmin()
      .from('propiedades').select('titulo').eq('id', publicadaDeA).single()
    expect(enBase!.titulo).toBe('Casa publicada aislamiento A')
  })

  it('ni puede borrarla: cero filas y la propiedad sigue ahi', async () => {
    const { data, error } = await clienteB
      .from('propiedades').delete().eq('id', publicadaDeA).select('id')

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)

    const { data: sigueAhi } = await clienteAdmin()
      .from('propiedades').select('id').eq('id', publicadaDeA)
    expect(sigueAhi).toHaveLength(1)
  })
})
