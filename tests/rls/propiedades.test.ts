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

  // RLS filtra FILAS, no columnas: la politica de lectura publica deja ver la
  // propiedad publicada entera, y el GRANT SELECT original era sobre todas las
  // columnas. La direccion exacta se protege con privilegios de columna, que es
  // otro mecanismo, y por eso ninguna prueba de RLS lo cubria.
  it('el anonimo NO puede leer direccion, latitud ni longitud', async () => {
    const anonimo = clienteAnonimo()

    for (const columna of ['direccion', 'latitud', 'longitud']) {
      const { data, error } = await anonimo.from('propiedades').select(columna).eq('id', idPublicada)
      expect(error?.code, `columna ${columna}`).toBe('42501')
      expect(data ?? [], `columna ${columna}`).toHaveLength(0)
    }

    // Un select('*') anonimo tambien queda denegado: pedir la tabla entera
    // incluye las columnas privadas. Es deliberado -- anadir una columna
    // sensible no debe publicarla sola.
    const { error: errorAsterisco } = await anonimo.from('propiedades').select('*').eq('id', idPublicada)
    expect(errorAsterisco?.code).toBe('42501')

    // Caso positivo 1: el MISMO cliente anonimo, pidiendo columnas publicas,
    // si recibe la fila. Sin esto, los 42501 de arriba se verian igual si la
    // fila no existiera o si anon hubiera perdido el acceso a la tabla entera.
    const { data: publicas, error: errorPublicas } = await anonimo
      .from('propiedades').select('id, titulo, precio, barrio_id, estado').eq('id', idPublicada)
    expect(errorPublicas).toBeNull()
    expect(publicas).toHaveLength(1)
    expect(publicas![0].precio).toBe(350000000)
    expect(publicas![0].estado).toBe('publicada')

    // Caso positivo 2: el vendedor dueno, autenticado, SI ve su direccion.
    // authenticated conserva el SELECT de tabla completa.
    const cliente = await clienteComo(A.correo, A.password)
    const { data: comoDueno, error: errorDueno } = await cliente
      .from('propiedades').select('direccion, latitud, longitud').eq('id', idPublicada)
    expect(errorDueno).toBeNull()
    expect(comoDueno).toHaveLength(1)
    expect(comoDueno![0].direccion).toBe('Calle 1 #2-3')
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
