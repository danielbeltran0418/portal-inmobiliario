import { describe, it, expect, vi, beforeEach } from 'vitest'
import { faltantesParaPublicar } from '@/lib/propiedades/completitud'

const getUser = vi.fn()
const insertMock = vi.fn()
const singleMock = vi.fn()
const updateMock = vi.fn()
const eqMock = vi.fn()
const selectUpdateMock = vi.fn()
const eqSelectMock = vi.fn()
const maybeSingleMock = vi.fn()
const deleteMock = vi.fn()
const eqDeleteMock = vi.fn()
const selectDeleteMock = vi.fn()
const crearClienteServidor = vi.fn()
const crearClienteAdmin = vi.fn()
const redirect = vi.fn()
const revalidatePath = vi.fn()

// Igual que en tests/unit/limite-intentos.test.ts: cliente-admin.ts importa
// 'server-only', que revienta con "This module cannot be imported from a
// Client Component module" en cuanto se carga bajo Node/Vitest (no hay
// condicion "react-server" fuera de Next). Sin este mock, importar acciones.ts
// mas abajo -- que ahora importa crearClienteAdmin para drenarLimpieza --
// tira abajo TODA la suite, no solo las pruebas nuevas.
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor }))
vi.mock('@/lib/supabase/cliente-admin', () => ({ crearClienteAdmin }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('next/cache', () => ({ revalidatePath }))

const { crearBorrador, actualizarPropiedad, cambiarEstado, eliminarPropiedad } = await import(
  '@/app/(vendedor)/panel/propiedades/acciones'
)

function clienteFalso() {
  return {
    auth: { getUser },
    from: () => ({
      insert: (payload: unknown) => {
        insertMock(payload)
        return { select: () => ({ single: singleMock }) }
      },
      update: (payload: unknown) => {
        updateMock(payload)
        return {
          eq: (columna: string, valor: string) => {
            eqMock(columna, valor)
            return { select: selectUpdateMock }
          },
        }
      },
      // Cadena de faltaParaPublicar() en cambiarEstado():
      // .select('precio, imagenes_propiedad(id)').eq('id', id).maybeSingle()
      select: (columnas: string) => ({
        eq: (columna: string, valor: string) => {
          eqSelectMock(columnas, columna, valor)
          return { maybeSingle: maybeSingleMock }
        },
      }),
      // Cadena de eliminarPropiedad(): .delete().eq('id', id).select('id')
      delete: () => {
        deleteMock()
        return {
          eq: (columna: string, valor: string) => {
            eqDeleteMock(columna, valor)
            return { select: selectDeleteMock }
          },
        }
      },
    }),
  }
}

// admin.from('limpieza_almacenamiento').select('id, ruta').limit(100)
// admin.storage.from(BUCKET_PROPIEDADES).remove([...])
// admin.from('limpieza_almacenamiento').delete().in('id', [...])
const limiteMock = vi.fn()
const removeMock = vi.fn()
const inMock = vi.fn()

function clienteAdminFalso() {
  return {
    from: () => ({
      select: () => ({ limit: limiteMock }),
      delete: () => ({ in: inMock }),
    }),
    storage: { from: () => ({ remove: removeMock }) },
  }
}

function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.append(k, v)
  return fd
}

// En produccion redirect() interrumpe la ejecucion lanzando NEXT_REDIRECT. El
// mock reproduce ese lanzamiento: crearBorrador llama a redirect('/login') a
// MITAD de la funcion (no al final), asi que un mock que no lanzara dejaria
// caer en el bucle de insercion con `usuario.user` nulo y reventaria con un
// TypeError distinto al que se quiere comprobar.
function comoNextRedirect() {
  redirect.mockImplementation((ruta: string) => {
    throw new Error(`NEXT_REDIRECT:${ruta}`)
  })
}

describe('crearBorrador', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'vendedor-1' } } })
    insertMock.mockReset()
    singleMock.mockReset().mockResolvedValue({ data: { id: 'prop-1' }, error: null })
    crearClienteServidor.mockReset().mockResolvedValue(clienteFalso())
    redirect.mockReset()
    revalidatePath.mockReset()
    comoNextRedirect()
  })

  it('con un titulo demasiado corto devuelve el error de campo y no llama a la base', async () => {
    const r = await crearBorrador({}, formulario({ titulo: 'Corto' }))

    expect(r.errores?.titulo).toBeTruthy()
    // Caso positivo del "no llama a la base": se comprueba que ni siquiera se
    // crea el cliente de Supabase, no solo que no se inserto.
    expect(crearClienteServidor).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('sin usuario autenticado redirige a /login sin insertar', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    await expect(
      crearBorrador({}, formulario({ titulo: 'Apartamento en el norte de la ciudad' })),
    ).rejects.toThrow('NEXT_REDIRECT:/login')

    expect(insertMock).not.toHaveBeenCalled()
  })

  it('reintenta con otro slug si hay colision de unicidad (23505) y termina creando el borrador', async () => {
    singleMock
      .mockResolvedValueOnce({ data: null, error: { code: '23505' } })
      .mockResolvedValueOnce({ data: { id: 'prop-2' }, error: null })

    await expect(
      crearBorrador({}, formulario({ titulo: 'Apartamento en el norte de la ciudad' })),
    ).rejects.toThrow('NEXT_REDIRECT:/panel/propiedades/prop-2')

    expect(insertMock).toHaveBeenCalledTimes(2)
    const slugUno = (insertMock.mock.calls[0]![0] as { slug: string }).slug
    const slugDos = (insertMock.mock.calls[1]![0] as { slug: string }).slug
    expect(slugUno).not.toBe(slugDos)
  })

  // Hallazgo Medio de revision: el bucle es correcto por inspeccion (sale al
  // acertar, no reintenta ante un error que no sea 23505, y si se agotan los
  // 3 intentos `id` queda null), pero el camino de agotamiento nunca se
  // habia ejercitado. Tres colisiones seguidas deben devolver error, no
  // colarse con un id nulo hacia revalidatePath/redirect.
  it('si las 3 colisiones de slug se agotan, devuelve error y no continua con id nulo', async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: '23505' } })

    const r = await crearBorrador(
      {},
      formulario({ titulo: 'Apartamento en el norte de la ciudad' }),
    )

    // INTENTOS_DE_SLUG en acciones.ts vale 3; no se exporta, se fija aqui.
    expect(insertMock).toHaveBeenCalledTimes(3)
    expect(r.error).toBeTruthy()
    expect(redirect).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  // Hallazgo Medio de revision: precio: 1 como marcador era indistinguible
  // de un precio real para faltantesParaPublicar (ambos son positivos). La
  // migracion 20260907000100 quito el NOT NULL de precio para que el
  // borrador pueda nacer sin el, y crearBorrador dejo de mandarlo. Esta
  // prueba conecta las dos puntas: si alguien reintroduce un marcador
  // numerico aqui, faltantesParaPublicar deja de reportar "El precio" y la
  // prueba cae.
  it('el borrador nuevo no manda un precio de marcador: sigue apareciendo como pendiente', async () => {
    await expect(
      crearBorrador({}, formulario({ titulo: 'Apartamento en el norte de la ciudad' })),
    ).rejects.toThrow('NEXT_REDIRECT:/panel/propiedades/prop-1')

    const payload = insertMock.mock.calls[0]![0] as Record<string, unknown>

    const faltan = faltantesParaPublicar({
      descripcion: (payload.descripcion as string | undefined) ?? '',
      barrio_id: (payload.barrio_id as string | null | undefined) ?? null,
      precio: (payload.precio as number | null | undefined) ?? null,
      numeroDeImagenes: 0,
    })
    expect(faltan).toContain('El precio')
  })

  it('ante un error que no es de colision de slug, no reintenta y responde el mensaje generico', async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: '42501' } })

    const r = await crearBorrador({}, formulario({ titulo: 'Apartamento en el norte de la ciudad' }))

    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(r.error).toBeTruthy()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('crea el borrador, revalida /panel y redirige a la propiedad recien creada', async () => {
    await expect(
      crearBorrador({}, formulario({ titulo: 'Apartamento en el norte de la ciudad' })),
    ).rejects.toThrow('NEXT_REDIRECT:/panel/propiedades/prop-1')

    expect(revalidatePath).toHaveBeenCalledWith('/panel')
  })
})

const datosValidos = {
  id: 'prop-1',
  titulo: 'Apartamento remodelado en el norte',
  descripcion: 'Descripcion completa del inmueble.',
  operacion: 'venta',
  tipo_inmueble: 'apartamento',
  precio: '250000000',
}

describe('actualizarPropiedad', () => {
  beforeEach(() => {
    updateMock.mockReset()
    eqMock.mockReset()
    selectUpdateMock.mockReset().mockResolvedValue({ data: [{ id: 'prop-1' }], error: null })
    crearClienteServidor.mockReset().mockResolvedValue(clienteFalso())
    revalidatePath.mockReset()
  })

  it('sin id devuelve el error generico y no llama a la base', async () => {
    const r = await actualizarPropiedad({}, formulario({ titulo: datosValidos.titulo }))

    expect(r.error).toBeTruthy()
    expect(crearClienteServidor).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('con datos invalidos devuelve errores con la clave del campo correcto', async () => {
    const r = await actualizarPropiedad({}, formulario({ ...datosValidos, precio: '-100' }))

    expect(r.errores?.precio).toBeTruthy()
    // Caso positivo de la clave correcta: un campo valido no debe aparecer.
    expect(r.errores?.titulo).toBeUndefined()
    expect(updateMock).not.toHaveBeenCalled()
  })

  // La prueba que mas importa: el slug se genera UNA vez al crear la
  // propiedad y no cambia jamas. Si alguien anade `slug` al objeto que se
  // manda al UPDATE (a mano, o por spread de formData), esta prueba falla.
  it('el UPDATE nunca incluye la columna slug, aunque el formulario la traiga', async () => {
    const fd = formulario(datosValidos)
    fd.append('slug', 'un-slug-distinto-forzado-por-el-cliente')

    const r = await actualizarPropiedad({}, fd)

    expect(r).toEqual({})
    expect(updateMock).toHaveBeenCalledTimes(1)
    const payload = updateMock.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('slug')
    // Y no porque el update fallara antes de llegar: si de verdad se aplico,
    // los campos reales si estan.
    expect(payload.titulo).toBe(datosValidos.titulo)
  })

  it('si RLS filtra todas las filas (no es el dueno) responde el error generico', async () => {
    selectUpdateMock.mockResolvedValue({ data: [], error: null })

    const r = await actualizarPropiedad({}, formulario(datosValidos))

    expect(r.error).toBeTruthy()
  })

  // Correccion del hallazgo Importante "un borrador no se puede guardar sin
  // precio": antes de esta correccion, esquemaPropiedad exigia precio
  // positivo y esta llamada devolvia { errores: { precio } } SIN llegar a
  // invocar el UPDATE -- perdiendo tambien titulo/descripcion/operacion,
  // aunque fueran validos por su cuenta. Un borrador recien creado
  // (crearBorrador, Task 8) nace con precio NULL a proposito.
  it('guarda un borrador sin precio: no es error de campo, y SI llega a llamar al UPDATE', async () => {
    const r = await actualizarPropiedad({}, formulario({ ...datosValidos, precio: '' }))

    expect(r).toEqual({})
    expect(r.errores?.precio).toBeUndefined()
    expect(updateMock).toHaveBeenCalledTimes(1)
    const payload = updateMock.mock.calls[0]![0] as Record<string, unknown>
    expect(payload.titulo).toBe(datosValidos.titulo)
  })

  it('actualiza correctamente y revalida las rutas del panel y de la propiedad', async () => {
    const r = await actualizarPropiedad({}, formulario(datosValidos))

    expect(r).toEqual({})
    expect(revalidatePath).toHaveBeenCalledWith('/panel/propiedades/prop-1')
    expect(revalidatePath).toHaveBeenCalledWith('/panel')
  })
})

describe('cambiarEstado', () => {
  beforeEach(() => {
    eqSelectMock.mockReset()
    maybeSingleMock.mockReset()
    updateMock.mockReset()
    eqMock.mockReset()
    selectUpdateMock.mockReset().mockResolvedValue({ data: [{ id: 'prop-1' }], error: null })
    crearClienteServidor.mockReset().mockResolvedValue(clienteFalso())
    revalidatePath.mockReset()
  })

  // El defecto que corrigio esta tarea: el brief original mandaba mapear
  // 23514 -> "necesitas una foto" a ciegas, pero hay DOS triggers que lanzan
  // ese mismo codigo (propiedades_exigir_imagen y propiedades_exigir_precio,
  // ver mapear.ts). faltaParaPublicar() evita la ambiguedad consultando la
  // fila real ANTES del UPDATE, asi que ninguna de estas dos pruebas depende
  // en absoluto del codigo de error de Postgres.
  it('al publicar sin fotos, devuelve el mensaje de foto y no llega a hacer el UPDATE', async () => {
    maybeSingleMock.mockResolvedValue({ data: { precio: 300000, imagenes_propiedad: [] } })

    const r = await cambiarEstado('prop-1', 'publicada')

    expect(r.error).toBe('Para publicar necesitas subir al menos una foto de la propiedad.')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('al publicar con fotos pero sin precio, devuelve el mensaje de precio y no llega a hacer el UPDATE', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { precio: null, imagenes_propiedad: [{ id: 'img-1' }] },
    })

    const r = await cambiarEstado('prop-1', 'publicada')

    expect(r.error).toBe('Para publicar necesitas fijar un precio para la propiedad.')
    expect(updateMock).not.toHaveBeenCalled()
  })

  // Decision documentada: si faltan las dos cosas se avisa de la foto
  // primero, igual que en la base (los triggers BEFORE se ejecutan en orden
  // alfabetico de nombre: 'imagen' antes que 'precio').
  it('si faltan foto y precio a la vez, se muestra el mensaje de la foto', async () => {
    maybeSingleMock.mockResolvedValue({ data: { precio: null, imagenes_propiedad: [] } })

    const r = await cambiarEstado('prop-1', 'publicada')

    expect(r.error).toBe('Para publicar necesitas subir al menos una foto de la propiedad.')
  })

  it('con foto y precio, publicar SI actualiza el estado y revalida las rutas', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { precio: 300000, imagenes_propiedad: [{ id: 'img-1' }] },
    })

    const r = await cambiarEstado('prop-1', 'publicada')

    expect(r).toEqual({})
    expect(updateMock).toHaveBeenCalledWith({ estado: 'publicada' })
    expect(revalidatePath).toHaveBeenCalledWith('/panel')
    expect(revalidatePath).toHaveBeenCalledWith('/panel/propiedades/prop-1')
  })

  // Pausar, marcar vendida o devolver a borrador no tienen requisito alguno
  // en la base: la comprobacion previa es SOLO para 'publicada'.
  it('cambiar a un estado que no es publicada no consulta faltaParaPublicar', async () => {
    const r = await cambiarEstado('prop-1', 'pausada')

    expect(r).toEqual({})
    expect(maybeSingleMock).not.toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledWith({ estado: 'pausada' })
  })

  it('si RLS filtra todas las filas (no es el dueno) responde el error generico', async () => {
    selectUpdateMock.mockResolvedValue({ data: [], error: null })

    const r = await cambiarEstado('prop-1', 'pausada')

    expect(r.error).toBeTruthy()
  })

  // Red de seguridad: si el UPDATE llega a fallar con 23514 pese a la
  // comprobacion previa (la carrera que documenta MENSAJE_REQUISITOS_PUBLICACION
  // en mapear.ts), cambiarEstado usa mapearError(error).mensaje, no el
  // mensaje generico a secas.
  it('si el UPDATE falla con 23514 pese a la comprobacion previa, usa el mensaje combinado de mapearError', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { precio: 300000, imagenes_propiedad: [{ id: 'img-1' }] },
    })
    selectUpdateMock.mockResolvedValue({ data: null, error: { code: '23514' } })

    const r = await cambiarEstado('prop-1', 'publicada')

    expect(r.error).toBe('Para publicar, la propiedad necesita al menos una foto y un precio.')
  })
})

describe('eliminarPropiedad', () => {
  beforeEach(() => {
    deleteMock.mockReset()
    eqDeleteMock.mockReset()
    selectDeleteMock.mockReset().mockResolvedValue({ data: [{ id: 'prop-1' }], error: null })
    crearClienteServidor.mockReset().mockResolvedValue(clienteFalso())
    crearClienteAdmin.mockReset().mockReturnValue(clienteAdminFalso())
    limiteMock.mockReset().mockResolvedValue({ data: [] })
    removeMock.mockReset().mockResolvedValue({ data: [] })
    inMock.mockReset().mockResolvedValue({ data: null, error: null })
    revalidatePath.mockReset()
  })

  it('si RLS filtra todas las filas (no es el dueno) responde el error generico y no drena la cola', async () => {
    selectDeleteMock.mockResolvedValue({ data: [], error: null })

    const r = await eliminarPropiedad('prop-ajena')

    expect(r.error).toBeTruthy()
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })

  it('si el DELETE de la base falla, responde el error generico y no drena la cola', async () => {
    selectDeleteMock.mockResolvedValue({ data: null, error: { code: '42501' } })

    const r = await eliminarPropiedad('prop-1')

    expect(r.error).toBeTruthy()
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })

  it('borra la propiedad, no hay nada pendiente en la cola: no llama a Storage', async () => {
    const r = await eliminarPropiedad('prop-1')

    expect(r).toEqual({})
    expect(deleteMock).toHaveBeenCalled()
    expect(eqDeleteMock).toHaveBeenCalledWith('id', 'prop-1')
    expect(limiteMock).toHaveBeenCalled()
    expect(removeMock).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/panel')
  })

  it('drena la cola: borra en Storage y quita de limpieza_almacenamiento solo lo confirmado', async () => {
    limiteMock.mockResolvedValue({
      data: [
        { id: 1, ruta: 'vendedor-1/a.webp' },
        { id: 2, ruta: 'vendedor-1/b.webp' },
      ],
    })
    // Storage solo confirma UNA de las dos rutas: la otra debe quedarse en
    // la cola, no perderse en silencio.
    removeMock.mockResolvedValue({ data: [{ name: 'vendedor-1/a.webp' }] })

    const r = await eliminarPropiedad('prop-1')

    expect(r).toEqual({})
    expect(removeMock).toHaveBeenCalledWith(['vendedor-1/a.webp', 'vendedor-1/b.webp'])
    expect(inMock).toHaveBeenCalledWith('id', [1])
  })

  it('si Storage no confirma ninguna ruta, no borra nada de limpieza_almacenamiento', async () => {
    limiteMock.mockResolvedValue({ data: [{ id: 1, ruta: 'vendedor-1/a.webp' }] })
    removeMock.mockResolvedValue({ data: [] })

    const r = await eliminarPropiedad('prop-1')

    expect(r).toEqual({})
    expect(removeMock).toHaveBeenCalled()
    expect(inMock).not.toHaveBeenCalled()
  })
})
