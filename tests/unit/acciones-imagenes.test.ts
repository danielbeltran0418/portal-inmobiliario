import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const insertMock = vi.fn()
const resultadoConteoMock = vi.fn()
const uploadMock = vi.fn()
const removeMock = vi.fn()
const rpcMock = vi.fn()
const resultadoOrdenMock = vi.fn()
const resultadoBorradoMock = vi.fn()
const crearClienteServidor = vi.fn()
const revalidatePath = vi.fn()
const procesarImagenMock = vi.fn()

// Igual que en tests/unit/accion-propiedades.test.ts: se sustituye el cliente
// de Supabase y next/cache por completo, y se mockea solo procesarImagen (no
// el modulo entero de src/lib/imagenes/procesar.ts) para conservar las
// constantes reales -- TIPOS_ACEPTADOS, TAMANO_MAXIMO_BYTES,
// MAXIMO_IMAGENES_POR_PROPIEDAD -- que son justo lo que estas pruebas
// necesitan ejercitar tal cual las usa produccion.
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/imagenes/procesar', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/lib/imagenes/procesar')>()
  return { ...real, procesarImagen: procesarImagenMock }
})

const { subirImagen, eliminarImagen, reordenarImagen } = await import(
  '@/app/(vendedor)/panel/propiedades/[id]/acciones-imagenes'
)
const { BUCKET_PROPIEDADES } = await import('@/lib/imagenes/firmar')

function clienteFalso() {
  return {
    auth: { getUser },
    from: () => ({
      // subirImagen(): .select('id', { count: 'exact', head: true }).eq('propiedad_id', id)
      // reordenarImagen(): .select('id, orden').eq('propiedad_id', id).order('orden', {...})
      select: (columnas: string) => {
        if (columnas === 'id, orden') {
          return { eq: () => ({ order: () => resultadoOrdenMock() }) }
        }
        return { eq: () => resultadoConteoMock() }
      },
      insert: (payload: unknown) => insertMock(payload),
      // eliminarImagen(): .delete().eq('id', imagenId).select('ruta_storage')
      delete: () => ({ eq: () => ({ select: () => resultadoBorradoMock() }) }),
    }),
    storage: { from: (bucket: string) => ({ upload: (...a: unknown[]) => uploadMock(bucket, ...a), remove: (...a: unknown[]) => removeMock(bucket, ...a) }) },
    rpc: (nombre: string, args: unknown) => rpcMock(nombre, args),
  }
}

function formularioDeSubida(campos: {
  propiedad_id?: string
  alt_text?: string
  archivo?: File | null
}): FormData {
  const fd = new FormData()
  if (campos.propiedad_id !== undefined) fd.append('propiedad_id', campos.propiedad_id)
  if (campos.alt_text !== undefined) fd.append('alt_text', campos.alt_text)
  if (campos.archivo) fd.append('archivo', campos.archivo)
  return fd
}

function archivoValido(bytes = 10): File {
  return new File([new Uint8Array(bytes)], 'foto.jpg', { type: 'image/jpeg' })
}

describe('subirImagen', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'vendedor-1' } } })
    insertMock.mockReset().mockResolvedValue({ error: null })
    resultadoConteoMock.mockReset().mockResolvedValue({ count: 0 })
    uploadMock.mockReset().mockResolvedValue({ error: null })
    removeMock.mockReset().mockResolvedValue({ data: [] })
    procesarImagenMock.mockReset().mockResolvedValue(Buffer.from('webp-procesado'))
    crearClienteServidor.mockReset().mockResolvedValue(clienteFalso())
    revalidatePath.mockReset()
  })

  // Exigido explicitamente: un tipo no aceptado o un archivo demasiado
  // grande se rechazan ANTES de procesar (y antes de tocar la base).
  it('rechaza un tipo de archivo no aceptado sin llamar a procesarImagen ni a la base', async () => {
    const archivo = new File([new Uint8Array(10)], 'foto.gif', { type: 'image/gif' })
    const r = await subirImagen(
      {},
      formularioDeSubida({ propiedad_id: 'prop-1', alt_text: 'Fachada de la casa', archivo }),
    )

    expect(r.error).toBe('Solo se aceptan imagenes JPG, PNG o WebP.')
    expect(procesarImagenMock).not.toHaveBeenCalled()
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })

  it('rechaza un archivo que supera los 5 MB sin llamar a procesarImagen ni a la base', async () => {
    const archivo = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'foto.jpg', { type: 'image/jpeg' })
    const r = await subirImagen(
      {},
      formularioDeSubida({ propiedad_id: 'prop-1', alt_text: 'Fachada de la casa', archivo }),
    )

    expect(r.error).toBe('La imagen supera los 5 MB.')
    expect(procesarImagenMock).not.toHaveBeenCalled()
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })

  // Exigido explicitamente: un alt_text de menos de 5 caracteres se rechaza.
  it('rechaza un alt_text de menos de 5 caracteres', async () => {
    const r = await subirImagen(
      {},
      formularioDeSubida({ propiedad_id: 'prop-1', alt_text: 'hola', archivo: archivoValido() }),
    )

    expect(r.error).toBe('Describe la foto en al menos 5 caracteres.')
    expect(procesarImagenMock).not.toHaveBeenCalled()
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })

  it('sin propiedad_id o sin archivo valido, pide elegir una imagen', async () => {
    const r = await subirImagen(
      {},
      formularioDeSubida({ alt_text: 'Fachada de la casa', archivo: archivoValido() }),
    )
    expect(r.error).toBe('Elige una imagen.')
  })

  it('sin usuario autenticado responde el mensaje generico', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const r = await subirImagen(
      {},
      formularioDeSubida({ propiedad_id: 'prop-1', alt_text: 'Fachada de la casa', archivo: archivoValido() }),
    )

    expect(r.error).toBeTruthy()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('con 12 imagenes ya subidas, rechaza la 13a sin procesar ni subir a Storage', async () => {
    resultadoConteoMock.mockResolvedValue({ count: 12 })

    const r = await subirImagen(
      {},
      formularioDeSubida({ propiedad_id: 'prop-1', alt_text: 'Fachada de la casa', archivo: archivoValido() }),
    )

    expect(r.error).toBe('Maximo 12 fotos por propiedad.')
    expect(procesarImagenMock).not.toHaveBeenCalled()
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('si procesarImagen lanza, responde el mensaje de procesamiento y no sube nada', async () => {
    procesarImagenMock.mockRejectedValue(new Error('sharp revento'))

    const r = await subirImagen(
      {},
      formularioDeSubida({ propiedad_id: 'prop-1', alt_text: 'Fachada de la casa', archivo: archivoValido() }),
    )

    expect(r.error).toBe('No pudimos procesar esa imagen. Prueba con otra.')
    expect(uploadMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  // La ruta generada debe empezar por el uid del vendedor: es lo que exige
  // storage_propiedades_escritura (RLS de Storage, SP0).
  it('sube con una ruta que empieza por <uid>/<propiedad_id>/ y termina en .webp', async () => {
    const r = await subirImagen(
      {},
      formularioDeSubida({ propiedad_id: 'prop-1', alt_text: 'Fachada de la casa', archivo: archivoValido() }),
    )

    expect(r).toEqual({})
    const [, ruta] = uploadMock.mock.calls[0]!
    expect(ruta).toMatch(/^vendedor-1\/prop-1\/[0-9a-f-]{36}\.webp$/)
    const payload = insertMock.mock.calls[0]![0] as Record<string, unknown>
    expect(payload.ruta_storage).toBe(ruta)
    expect(revalidatePath).toHaveBeenCalledWith('/panel/propiedades/prop-1')
  })

  it('si falla la subida a Storage, responde el mensaje generico y no inserta la fila', async () => {
    uploadMock.mockResolvedValue({ error: { code: 'x' } })

    const r = await subirImagen(
      {},
      formularioDeSubida({ propiedad_id: 'prop-1', alt_text: 'Fachada de la casa', archivo: archivoValido() }),
    )

    expect(r.error).toBeTruthy()
    expect(insertMock).not.toHaveBeenCalled()
  })

  // El camino huerfano que documenta el brief: si el INSERT falla (por
  // ejemplo, RLS -- propiedadId no es del vendedor), el archivo YA subido a
  // Storage se borra a mano, porque el trigger de limpieza solo se dispara
  // al borrar una FILA, y aqui nunca llego a haber fila.
  it('si el INSERT falla, borra el archivo huerfano de Storage y responde el mensaje generico', async () => {
    insertMock.mockResolvedValue({ error: { code: '42501' } })

    const r = await subirImagen(
      {},
      formularioDeSubida({ propiedad_id: 'prop-ajena', alt_text: 'Fachada de la casa', archivo: archivoValido() }),
    )

    expect(r.error).toBeTruthy()
    expect(removeMock).toHaveBeenCalledTimes(1)
    const [bucket, [rutaBorrada]] = removeMock.mock.calls[0] as [string, string[]]
    expect(bucket).toBe(BUCKET_PROPIEDADES)
    expect(rutaBorrada).toMatch(/^vendedor-1\/prop-ajena\//)
  })

  it('sube correctamente, revalida la ruta del panel y no borra nada de Storage', async () => {
    const r = await subirImagen(
      {},
      formularioDeSubida({ propiedad_id: 'prop-1', alt_text: 'Fachada de la casa', archivo: archivoValido() }),
    )

    expect(r).toEqual({})
    expect(removeMock).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/panel/propiedades/prop-1')
  })
})

describe('eliminarImagen', () => {
  beforeEach(() => {
    resultadoBorradoMock.mockReset().mockResolvedValue({ data: [{ ruta_storage: 'vendedor-1/prop-1/a.webp' }], error: null })
    removeMock.mockReset().mockResolvedValue({ data: [{ name: 'vendedor-1/prop-1/a.webp' }] })
    crearClienteServidor.mockReset().mockResolvedValue(clienteFalso())
    revalidatePath.mockReset()
  })

  it('si RLS filtra todas las filas (no es tuya), responde el mensaje generico y no toca Storage', async () => {
    resultadoBorradoMock.mockResolvedValue({ data: [], error: null })

    const r = await eliminarImagen('img-ajena', 'prop-1')

    expect(r.error).toBeTruthy()
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('si el DELETE de la base falla, responde el mensaje generico y no toca Storage', async () => {
    resultadoBorradoMock.mockResolvedValue({ data: null, error: { code: '42501' } })

    const r = await eliminarImagen('img-1', 'prop-1')

    expect(r.error).toBeTruthy()
    expect(removeMock).not.toHaveBeenCalled()
  })

  // La que mas importa a nivel de contrato con Storage: se borra el archivo
  // REAL (se llama a remove con la ruta que devolvio el DELETE), no solo la
  // fila. La comprobacion de que el archivo desaparece DE VERDAD del bucket
  // vive en tests/rls/acciones-imagenes.test.ts, contra Storage real.
  it('borra la fila, borra el archivo correspondiente en Storage y revalida la ruta', async () => {
    const r = await eliminarImagen('img-1', 'prop-1')

    expect(r).toEqual({})
    expect(removeMock).toHaveBeenCalledWith(BUCKET_PROPIEDADES, ['vendedor-1/prop-1/a.webp'])
    expect(revalidatePath).toHaveBeenCalledWith('/panel/propiedades/prop-1')
  })
})

describe('reordenarImagen', () => {
  beforeEach(() => {
    resultadoOrdenMock.mockReset().mockResolvedValue({
      data: [
        { id: 'img-a', orden: 0 },
        { id: 'img-b', orden: 1 },
        { id: 'img-c', orden: 2 },
      ],
    })
    rpcMock.mockReset().mockResolvedValue({ error: null })
    crearClienteServidor.mockReset().mockResolvedValue(clienteFalso())
    revalidatePath.mockReset()
  })

  it('mover la del medio "arriba" intercambia con la anterior via el RPC atomico', async () => {
    const r = await reordenarImagen('img-b', 'prop-1', 'arriba')

    expect(r).toEqual({})
    expect(rpcMock).toHaveBeenCalledWith('intercambiar_orden_imagenes', {
      p_imagen_id_1: 'img-b',
      p_imagen_id_2: 'img-a',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/panel/propiedades/prop-1')
  })

  it('mover la del medio "abajo" intercambia con la siguiente', async () => {
    await reordenarImagen('img-b', 'prop-1', 'abajo')

    expect(rpcMock).toHaveBeenCalledWith('intercambiar_orden_imagenes', {
      p_imagen_id_1: 'img-b',
      p_imagen_id_2: 'img-c',
    })
  })

  it('la primera no puede moverse "arriba": no llama al RPC', async () => {
    const r = await reordenarImagen('img-a', 'prop-1', 'arriba')

    expect(r).toEqual({})
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('la ultima no puede moverse "abajo": no llama al RPC', async () => {
    const r = await reordenarImagen('img-c', 'prop-1', 'abajo')

    expect(r).toEqual({})
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('un id que no esta en el listado (no es tuyo) no llama al RPC', async () => {
    const r = await reordenarImagen('img-ajena', 'prop-1', 'arriba')

    expect(r).toEqual({})
    expect(rpcMock).not.toHaveBeenCalled()
  })

  // RIESGO 1: si el RPC atomico devuelve error (por ejemplo, RLS lo bloqueo
  // a mitad, o hubo un fallo real), se responde el mensaje generico y NO se
  // revalida -- al ser una unica funcion transaccional, o se movieron las
  // dos filas o no se movio ninguna; no hay estado a medias que mostrar.
  it('si el RPC falla, responde el mensaje generico y no revalida', async () => {
    rpcMock.mockResolvedValue({ error: { code: '42501' } })

    const r = await reordenarImagen('img-b', 'prop-1', 'arriba')

    expect(r.error).toBeTruthy()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('si el listado no llega (error de red/RLS antes de tiempo), responde el mensaje generico', async () => {
    resultadoOrdenMock.mockResolvedValue({ data: null })

    const r = await reordenarImagen('img-b', 'prop-1', 'arriba')

    expect(r.error).toBeTruthy()
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
