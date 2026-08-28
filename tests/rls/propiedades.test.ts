import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAnonimo, clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const A = { correo: 'vendedor-a@prueba.test', password: 'ClaveDePrueba123!' }
const B = { correo: 'vendedor-b@prueba.test', password: 'ClaveDePrueba123!' }

let idA = ''
let idPublicada = ''
let idBorrador = ''

describe('RLS de propiedades', () => {
  beforeAll(async () => {
    idA = await crearUsuarioDePrueba({ ...A, rol: 'vendedor' })
    await crearUsuarioDePrueba({ ...B, rol: 'vendedor' })

    const admin = clienteAdmin()
    const { data: barrio } = await admin.from('barrios').select('id').eq('slug', 'villa-carolina').single()

    const base = {
      vendedor_id: idA, barrio_id: barrio!.id, operacion: 'venta',
      tipo_inmueble: 'apartamento', precio: 350000000, habitaciones: 3, banos: 2,
      area_m2: 78, direccion: 'Calle 1 #2-3', descripcion: 'Descripcion de prueba',
    }
    const { data: pub } = await admin.from('propiedades')
      .insert({ ...base, slug: 'apartamento-villa-carolina-prueba', titulo: 'Apartamento publicado', estado: 'publicada' })
      .select('id').single()
    idPublicada = pub!.id

    const { data: bor } = await admin.from('propiedades')
      .insert({ ...base, slug: 'apartamento-borrador-prueba', titulo: 'Apartamento borrador', estado: 'borrador' })
      .select('id').single()
    idBorrador = bor!.id
  })

  it('el anonimo ve la propiedad publicada', async () => {
    const { data } = await clienteAnonimo().from('propiedades').select('id').eq('id', idPublicada)
    expect(data).toHaveLength(1)
  })

  it('el anonimo NO ve la propiedad en borrador', async () => {
    const { data } = await clienteAnonimo().from('propiedades').select('id').eq('id', idBorrador)
    expect(data).toHaveLength(0)
  })

  it('el vendedor dueno ve su propio borrador', async () => {
    const cliente = await clienteComo(A.correo, A.password)
    const { data } = await cliente.from('propiedades').select('id').eq('id', idBorrador)
    expect(data).toHaveLength(1)
  })

  it('el vendedor B NO ve el borrador del vendedor A', async () => {
    const cliente = await clienteComo(B.correo, B.password)
    const { data } = await cliente.from('propiedades').select('id').eq('id', idBorrador)
    expect(data).toHaveLength(0)
  })

  it('el vendedor dueno SI puede editar su propia propiedad publicada', async () => {
    const cliente = await clienteComo(A.correo, A.password)
    const { data, error } = await cliente.from('propiedades')
      .update({ titulo: 'Apartamento actualizado por dueno' }).eq('id', idPublicada).select('id, titulo')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].titulo).toBe('Apartamento actualizado por dueno')
  })

  it('el vendedor B NO puede editar la propiedad del vendedor A', async () => {
    const cliente = await clienteComo(B.correo, B.password)
    const { data } = await cliente.from('propiedades')
      .update({ titulo: 'Secuestrada' }).eq('id', idPublicada).select('id')
    expect(data ?? []).toHaveLength(0)
  })

  it('el vendedor B no puede publicar a nombre del vendedor A', async () => {
    const cliente = await clienteComo(B.correo, B.password)
    const { error } = await cliente.from('propiedades').insert({
      vendedor_id: idA, slug: 'suplantada', titulo: 'Suplantada', descripcion: 'x',
      operacion: 'venta', tipo_inmueble: 'casa', precio: 1, estado: 'borrador',
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })
})
