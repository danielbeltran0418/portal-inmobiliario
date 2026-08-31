import { describe, it, expect, beforeAll } from 'vitest'
import { clienteAnonimo, clienteAdmin, clienteComo, crearUsuarioDePrueba } from './ayudantes'

const A = { correo: 'img-vendedor-a@prueba.test', password: 'ClaveDePrueba123!' }
const B = { correo: 'img-vendedor-b@prueba.test', password: 'ClaveDePrueba123!' }
let idPublicada = ''
let idBorrador = ''
let idVendedorA = ''
let idVendedorB = ''
let rutaObjetoPrueba = ''

describe('imagenes de propiedad', () => {
  beforeAll(async () => {
    const idA = await crearUsuarioDePrueba({ ...A, rol: 'vendedor' })
    idVendedorB = await crearUsuarioDePrueba({ ...B, rol: 'vendedor' })
    idVendedorA = idA
    const admin = clienteAdmin()
    const { data: barrio } = await admin.from('barrios').select('id').eq('slug', 'riomar').single()
    const base = {
      vendedor_id: idA, barrio_id: barrio!.id, operacion: 'arriendo',
      tipo_inmueble: 'casa', precio: 2500000, descripcion: 'x',
    }
    const { data: p } = await admin.from('propiedades')
      .insert({ ...base, slug: 'casa-riomar-imagenes', titulo: 'Casa con imagenes', estado: 'publicada' })
      .select('id').single()
    idPublicada = p!.id
    const { data: b } = await admin.from('propiedades')
      .insert({ ...base, slug: 'casa-riomar-borrador', titulo: 'Casa en borrador', estado: 'borrador' })
      .select('id').single()
    idBorrador = b!.id
  })

  beforeAll(async () => {
    // Objeto real en el bucket, dentro de la carpeta del vendedor A, para
    // probar el listado restringido por RLS y la lectura por URL publica.
    rutaObjetoPrueba = `${idVendedorA}/prueba.webp`
    const { error } = await clienteAdmin().storage.from('propiedades')
      .upload(rutaObjetoPrueba, Buffer.from('contenido de prueba para storage'), {
        contentType: 'image/webp',
        upsert: true,
      })
    if (error) throw error
  })

  it('rechaza una imagen sin alt_text', async () => {
    const { error } = await clienteAdmin().from('imagenes_propiedad')
      .insert({ propiedad_id: idPublicada, ruta_storage: 'x/1.webp', orden: 1 })
    // alt_text ausente -> la columna recibe NULL -> viola NOT NULL antes de
    // llegar al CHECK (un CHECK con NULL se evalua como "no violado").
    expect(error?.code).toBe('23502')
  })

  it('rechaza una imagen con alt_text demasiado corto', async () => {
    const { error } = await clienteAdmin().from('imagenes_propiedad')
      .insert({ propiedad_id: idPublicada, ruta_storage: 'x/1b.webp', alt_text: 'hi', orden: 1 })
    // alt_text presente pero de 2 caracteres -> NOT NULL se cumple, pero
    // el CHECK length(TRIM(alt_text)) >= 5 falla.
    expect(error?.code).toBe('23514')
  })

  it('acepta una imagen con alt_text', async () => {
    const { error } = await clienteAdmin().from('imagenes_propiedad')
      .insert({ propiedad_id: idPublicada, ruta_storage: 'x/2.webp', alt_text: 'Fachada de la casa en Riomar', orden: 1 })
    expect(error).toBeNull()
  })

  it('el anonimo ve las imagenes de una propiedad publicada', async () => {
    // Control positivo: pin exacto del conteo (solo la imagen aceptada arriba
    // debe existir para esta propiedad en este punto de la suite).
    const { data } = await clienteAnonimo().from('imagenes_propiedad').select('id').eq('propiedad_id', idPublicada)
    expect(data).toHaveLength(1)
  })

  it('el anonimo NO ve las imagenes de un borrador', async () => {
    await clienteAdmin().from('imagenes_propiedad')
      .insert({ propiedad_id: idBorrador, ruta_storage: 'x/3.webp', alt_text: 'Interior', orden: 1 })
    const { data } = await clienteAnonimo().from('imagenes_propiedad').select('id').eq('propiedad_id', idBorrador)
    expect(data).toHaveLength(0)
  })

  it('el vendedor B no puede anadir imagenes a la propiedad del vendedor A', async () => {
    const cliente = await clienteComo(B.correo, B.password)
    const { error } = await cliente.from('imagenes_propiedad')
      .insert({ propiedad_id: idPublicada, ruta_storage: 'x/4.webp', alt_text: 'Intruso', orden: 9 })
    expect(error?.code).toBe('42501')
  })

  it('el vendedor dueno SI puede listar su propia carpeta en el bucket', async () => {
    // Control positivo para las dos pruebas de listado de abajo: el dueno
    // real de la carpeta debe poder listarla.
    const cliente = await clienteComo(A.correo, A.password)
    const { data, error } = await cliente.storage.from('propiedades').list(idVendedorA)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].name).toBe('prueba.webp')
  })

  it('el anonimo NO puede listar el bucket de propiedades', async () => {
    // Sin la politica de anon, el rol anonimo no tiene ninguna politica de
    // SELECT aplicable sobre storage.objects: el listado siempre devuelve
    // cero filas, tanto para la carpeta del vendedor A como para la raiz.
    const { data: listadoCarpeta } = await clienteAnonimo().storage.from('propiedades').list(idVendedorA)
    expect(listadoCarpeta ?? []).toHaveLength(0)

    const { data: listadoRaiz } = await clienteAnonimo().storage.from('propiedades').list()
    expect(listadoRaiz ?? []).toHaveLength(0)
  })

  // Nadie probaba que un vendedor no pueda sacar una imagen suya HACIA FUERA:
  // las demas pruebas cubren al intruso escribiendo sobre lo ajeno, y ninguna
  // cambiaba propiedad_id.
  //
  // Ojo con lo que esta prueba demuestra y lo que no: la proteccion ya existia
  // antes de 20260831000200, porque PostgreSQL usa la expresion de USING como
  // WITH CHECK cuando esta no se declara. La migracion solo la hace explicita.
  // Lo que esta prueba fija es el comportamiento, no la forma de escribirlo:
  // falla si alguien afloja el WITH CHECK (verificado poniendolo en `true`) y
  // falla tambien si alguien lo endurece de mas, por el caso positivo del
  // final.
  it('el vendedor A no puede mover una imagen suya a una propiedad del vendedor B', async () => {
    const admin = clienteAdmin()
    const { data: barrio } = await admin.from('barrios').select('id').eq('slug', 'riomar').single()

    // estado 'publicada' A PROPOSITO, y esto es lo delicado de la prueba.
    //
    // PostgREST convierte el .select() encadenado en un RETURNING, y a las
    // filas devueltas por un RETURNING se les aplican las politicas de SELECT.
    // Con la propiedad de B en 'borrador', la fila resultante no seria visible
    // para A por ninguna politica de lectura, y Postgres devolveria 42501
    // igualmente -- por la lectura, no por el WITH CHECK. La prueba pasaria
    // aunque el WITH CHECK fuera `true`. Comprobado: con B en 'borrador' y
    // WITH CHECK (true), el movimiento se bloquea; con B 'publicada' y el
    // mismo WITH CHECK (true), el movimiento SE CONSUMA.
    //
    // Publicada, la fila resultante SI seria legible para A via
    // imagenes_lectura_publica, asi que lo unico que puede impedir el
    // movimiento es el WITH CHECK de la politica de UPDATE. Que es lo que se
    // quiere medir.
    const { data: propiedadB, error: errorPropiedadB } = await admin.from('propiedades').insert({
      vendedor_id: idVendedorB, barrio_id: barrio!.id, operacion: 'arriendo',
      tipo_inmueble: 'casa', precio: 1800000, descripcion: 'x',
      slug: 'casa-del-vendedor-b', titulo: 'Casa del vendedor B', estado: 'publicada',
    }).select('id').single()
    expect(errorPropiedadB).toBeNull()

    const { data: imagen, error: errorImagen } = await admin.from('imagenes_propiedad').insert({
      propiedad_id: idPublicada, ruta_storage: 'x/secuestro.webp',
      alt_text: 'Imagen que se intenta mover', orden: 7,
    }).select('id').single()
    expect(errorImagen).toBeNull()

    const cliente = await clienteComo(A.correo, A.password)

    // Se encadena .select(): un UPDATE de PostgREST que no afecta filas
    // devuelve error nulo, asi que sin las filas devueltas la asercion no
    // distinguiria "denegado" de "no habia nada que actualizar".
    const { data: secuestro, error } = await cliente.from('imagenes_propiedad')
      .update({ propiedad_id: propiedadB!.id }).eq('id', imagen!.id)
      .select('id, propiedad_id')

    // Una violacion de WITH CHECK no filtra en silencio: levanta error.
    expect(error?.code).toBe('42501')
    expect(secuestro ?? []).toHaveLength(0)

    // Y el dato en la base sigue intacto, leido con service_role (salta RLS).
    const { data: enBase } = await admin.from('imagenes_propiedad')
      .select('propiedad_id').eq('id', imagen!.id).single()
    expect(enBase!.propiedad_id).toBe(idPublicada)

    // Caso positivo en el mismo test: mover la imagen a OTRA propiedad del
    // propio vendedor A SI tiene que funcionar. Sin esto, un WITH CHECK que
    // denegara todo UPDATE pasaria las aserciones de arriba.
    const { data: movida, error: errorMover } = await cliente.from('imagenes_propiedad')
      .update({ propiedad_id: idBorrador }).eq('id', imagen!.id)
      .select('id, propiedad_id')
    expect(errorMover).toBeNull()
    expect(movida).toHaveLength(1)
    expect(movida![0].propiedad_id).toBe(idBorrador)
  })

  it('la URL publica del objeto sigue resolviendo sin autenticacion', async () => {
    // Verifica empiricamente que restringir la politica de SELECT (que solo
    // gobierna listado/lectura autenticados) no rompe la ruta de URL publica
    // de Storage, que sirve el objeto sin consultar RLS porque el bucket es
    // public=true.
    const { data } = clienteAnonimo().storage.from('propiedades').getPublicUrl(rutaObjetoPrueba)
    const respuesta = await fetch(data.publicUrl)
    expect(respuesta.ok).toBe(true)
    expect(respuesta.status).toBe(200)
  })
})
