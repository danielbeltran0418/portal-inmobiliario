import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const insertMock = vi.fn()
const singleMock = vi.fn()
const updateMock = vi.fn()
const eqMock = vi.fn()
const selectUpdateMock = vi.fn()
const crearClienteServidor = vi.fn()
const redirect = vi.fn()
const revalidatePath = vi.fn()

vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('next/cache', () => ({ revalidatePath }))

const { crearBorrador, actualizarPropiedad } = await import(
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
    }),
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

  it('actualiza correctamente y revalida las rutas del panel y de la propiedad', async () => {
    const r = await actualizarPropiedad({}, formulario(datosValidos))

    expect(r).toEqual({})
    expect(revalidatePath).toHaveBeenCalledWith('/panel/propiedades/prop-1')
    expect(revalidatePath).toHaveBeenCalledWith('/panel')
  })
})
