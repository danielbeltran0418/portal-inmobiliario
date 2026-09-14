import { randomUUID } from 'node:crypto'
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
    // Nace en borrador (el default) y se publica en un segundo paso, con una
    // imagen de por medio: desde 20260904000300_exigir_imagen_publicar.sql,
    // un INSERT directo con estado 'publicada' sin imagenes lo rechaza el
    // trigger con 23514. Esta suite no prueba ese trigger -- lo hace
    // imagen-publicar.test.ts -- asi que el fixture solo necesita rodearlo.
    const { data: pub } = await admin.from('propiedades')
      .insert({ ...base, slug: 'apartamento-villa-carolina-prueba', titulo: 'Apartamento publicado' })
      .select('id').single()
    idPublicada = pub!.id
    await admin.from('imagenes_propiedad').insert({
      propiedad_id: idPublicada, ruta_storage: 'fixtures/apartamento-villa-carolina.webp',
      alt_text: 'Fachada del apartamento de prueba',
    })
    const { error: errorPublicar } = await admin.from('propiedades')
      .update({ estado: 'publicada' }).eq('id', idPublicada)
    if (errorPublicar) throw errorPublicar

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

  /**
   * Hallazgo bloqueante de la Task 11 (SP3): esta es la prueba que fija la
   * verdad de las politicas. Las demas pruebas de esta suite SIEMPRE filtran
   * por `.eq('id', ...)` puntual -- por eso ninguna ejercitaba lo que pasa
   * con una consulta SIN filtro, que es justo como la hacia el panel del
   * vendedor antes de este arreglo.
   *
   * Postgres combina las politicas SELECT permisivas del MISMO comando con
   * OR: propiedades_lectura_dueno (vendedor_id = auth.uid()) OR
   * propiedades_lectura_publica (estado = 'publicada', que tambien alcanza a
   * `authenticated`, no solo a `anon`). Resultado real: un vendedor
   * autenticado que pide la tabla sin filtro recibe sus propias filas MAS
   * las publicadas de cualquier otro vendedor. RLS NO basta para que "mis
   * propiedades" signifique "las mias" -- hace falta un
   * `.eq('vendedor_id', ...)` explicito en la aplicacion (ver
   * src/app/(vendedor)/panel/page.tsx).
   */
  it('SIN filtro explicito, el vendedor B TAMBIEN ve la propiedad publicada del vendedor A', async () => {
    const cliente = await clienteComo(B.correo, B.password)
    const { data, error } = await cliente.from('propiedades').select('id, vendedor_id, estado')
    expect(error).toBeNull()

    const ids = (data ?? []).map((fila) => fila.id)

    // El bug: la publicada de A se cuela en una consulta de B sin filtro.
    expect(ids).toContain(idPublicada)

    // Caso de control, en la MISMA consulta sin filtro: el borrador de A no
    // es publico y B no es su dueno, asi que no deberia aparecer. Sin este
    // control, un cambio que devolviera la tabla entera sin RLS alguna
    // tambien haria pasar la linea de arriba.
    expect(ids).not.toContain(idBorrador)
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

  /**
   * PASO 1 del arreglo de la fuga de la direccion exacta. La prueba de arriba
   * ("el anonimo NO puede leer...") solo cubre DOS de los tres casos: anonimo
   * y dueno. Le falta el tercero -- un AUTENTICADO AJENO -- y es justo el que
   * demuestra la fuga: 20260831000300 le revoca a `anon` el SELECT de tabla y
   * se lo deja solo sobre las columnas publicas, pero A `authenticated` NO SE
   * LE QUITA NADA (el comentario de esa migracion lo dice explicito). RLS
   * filtra FILAS, no columnas: propiedades_lectura_publica deja ver la
   * propiedad publicada entera a CUALQUIER authenticated, y el GRANT SELECT
   * de tabla completa de 20260827000600 nunca se le toco a ese rol. Con el
   * registro abierto (limite de 3 altas por hora por IP), basta crearse una
   * cuenta para recoger la direccion de todo el catalogo.
   *
   * Cuenta EFIMERA con randomUUID() en el correo, un comprador cualquiera sin
   * ninguna relacion con la propiedad -- no la cuenta fija del seed.
   */
  it('un autenticado AJENO NO puede leer direccion, latitud ni longitud de una propiedad publicada de otro', async () => {
    const correoAjeno = `comprador-ajeno-${randomUUID()}@prueba.test`
    const passwordAjeno = 'CompradorAjeno2026*'
    await crearUsuarioDePrueba({ correo: correoAjeno, password: passwordAjeno, rol: 'comprador' })
    const ajeno = await clienteComo(correoAjeno, passwordAjeno)

    const { data, error } = await ajeno
      .from('propiedades')
      .select('direccion, latitud, longitud')
      .eq('id', idPublicada)

    expect(error?.code, 'un ajeno autenticado debe recibir 42501, no la fila').toBe('42501')
    expect(data ?? []).toHaveLength(0)

    // Caso positivo, en la MISMA prueba: el dueno SI la recibe. Sin este
    // control, la prueba pasaria en verde igual si la propiedad no existiera
    // o si `idPublicada` estuviera mal.
    const dueno = await clienteComo(A.correo, A.password)
    const { data: comoDueno, error: errorDueno } = await dueno
      .from('propiedades')
      .select('direccion, latitud, longitud')
      .eq('id', idPublicada)
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
