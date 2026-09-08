import { describe, it, expect, vi, beforeEach } from 'vitest'

const crearClienteServidor = vi.fn()
const crearClienteAdmin = vi.fn()
const redirect = vi.fn()
const notFound = vi.fn()
const revalidatePath = vi.fn()
const firmarImagenes = vi.fn()

// [id]/page.tsx importa cambiarEstado de '../acciones' (Task 9), y
// [id]/panel-fotos.tsx importa subirImagen/eliminarImagen/reordenarImagen de
// './acciones-imagenes' (Task 10): ambos modulos 'use server' importan
// crearClienteAdmin (@/lib/supabase/cliente-admin, que declara 'server-only')
// y crearClienteServidor. Igual que en tests/unit/accion-propiedades.test.ts:
// sin estos mocks, la sola importacion de la pagina revienta bajo Vitest/Node.
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor }))
vi.mock('@/lib/supabase/cliente-admin', () => ({ crearClienteAdmin }))
vi.mock('next/navigation', () => ({ redirect, notFound }))
vi.mock('next/cache', () => ({ revalidatePath }))
// El bucket es PRIVADO (ver src/lib/imagenes/firmar.ts): se mockea entero
// para controlar exactamente que URL "firmada" recibe la pantalla y probar,
// de forma directa, que nunca es una URL publica construida a mano.
// BUCKET_PROPIEDADES se re-exporta porque acciones.ts y acciones-imagenes.ts
// tambien lo importan de este mismo modulo.
vi.mock('@/lib/imagenes/firmar', () => ({
  BUCKET_PROPIEDADES: 'propiedades',
  firmarImagenes,
}))

const { default: PaginaEditarPropiedad, metadata } = await import(
  '@/app/(vendedor)/panel/propiedades/[id]/page'
)
const { PanelFotos } = await import('@/app/(vendedor)/panel/propiedades/[id]/panel-fotos')
const { FormularioDatos, valorInicialNumerico } = await import(
  '@/app/(vendedor)/panel/propiedades/[id]/formulario-datos'
)

/**
 * Extrae el texto plano de un arbol de elementos de React SIN renderizarlo a
 * DOM -- mismo truco que tests/unit/panel-vendedor.test.ts: este proyecto usa
 * vitest en entorno 'node', sin jsdom ni @testing-library.
 */
function textoPlano(nodo: unknown): string {
  if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return ''
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo)
  if (Array.isArray(nodo)) return nodo.map(textoPlano).join('')
  if (typeof nodo === 'object' && 'props' in (nodo as Record<string, unknown>)) {
    return textoPlano((nodo as { props?: { children?: unknown } }).props?.children)
  }
  return ''
}

/**
 * Busca, en el arbol de elementos que devuelve la pagina, el primer nodo que
 * cumpla `predicado` -- camina `props.children` recursivamente, igual que
 * `tieneEnlaceA` en tests/unit/panel-vendedor.test.ts. Sirve tanto para
 * encontrar un <button> por su texto como para encontrar el elemento de un
 * componente cliente (FormularioDatos, PanelFotos) por su `type` e inspeccionar
 * los props que la pagina le paso, SIN invocar ese componente (son clientes
 * con hooks: no se pueden llamar fuera de un render real).
 */
function buscarNodo(
  nodo: unknown,
  predicado: (nodo: { type?: unknown; props?: Record<string, unknown> }) => boolean,
): { type?: unknown; props?: Record<string, unknown> } | null {
  if (nodo === null || nodo === undefined || typeof nodo !== 'object') return null
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) {
      const hallado = buscarNodo(hijo, predicado)
      if (hallado) return hallado
    }
    return null
  }
  const elemento = nodo as { type?: unknown; props?: Record<string, unknown> }
  if (predicado(elemento)) return elemento
  if (!elemento.props) return null
  return buscarNodo(elemento.props.children, predicado)
}

function encontrarBoton(nodo: unknown, texto: string) {
  return buscarNodo(nodo, (el) => el.type === 'button' && textoPlano(el.props?.children) === texto)
}

const ID_USUARIO = 'usuario-de-prueba-11111111-1111-1111-1111-111111111111'
const ID_OTRO_VENDEDOR = 'otro-vendedor-22222222-2222-2222-2222-222222222222'

interface ImagenFalsa {
  id: string
  ruta_storage: string
  alt_text: string
  orden: number
}

interface FilaPropiedadFalsa {
  id: string
  vendedor_id: string
  titulo: string
  descripcion: string | null
  operacion: 'venta' | 'arriendo'
  tipo_inmueble: 'apartamento' | 'casa' | 'local' | 'lote' | 'oficina'
  precio: number | null
  habitaciones: number | null
  banos: number | null
  area_m2: number | null
  barrio_id: string | null
  direccion: string | null
  estado: string
  imagenes_propiedad: ImagenFalsa[]
}

// Completa a proposito: los 4 requisitos de faltantesParaPublicar (foto,
// barrio, precio, descripcion >= 40 caracteres) estan cubiertos, para poder
// usarla tal cual en el caso "sin faltantes" y solo tocar el campo que cada
// prueba necesita vaciar.
const BASE_PROPIA: FilaPropiedadFalsa = {
  id: 'prop-1',
  vendedor_id: ID_USUARIO,
  titulo: 'Apartamento en el Prado',
  descripcion: 'Una descripcion con el detalle suficiente para el catalogo, de sobra.',
  operacion: 'venta',
  tipo_inmueble: 'apartamento',
  precio: 250000000,
  habitaciones: 3,
  banos: 2,
  area_m2: 80,
  barrio_id: '11111111-1111-1111-1111-111111111111',
  direccion: 'Calle 72 # 45-10',
  estado: 'borrador',
  imagenes_propiedad: [
    { id: 'img-1', ruta_storage: 'usuario-1/prop-1/a.webp', alt_text: 'Fachada de la casa', orden: 0 },
  ],
}

/**
 * Imita el encadenado real de PostgREST-js para
 * `.from('propiedades').select(...).eq('id', id).eq('vendedor_id', uid).maybeSingle()`
 * y para `.from('barrios').select(...).eq('activo', true).order('nombre')`.
 *
 * El corazon de esta funcion es `maybeSingleMock`: reproduce en miniatura
 * exactamente el bug que corrigio la Task 11 (ver el comentario de cabecera
 * de src/app/(vendedor)/panel/propiedades/[id]/page.tsx) -- `propiedades`
 * tiene DOS politicas SELECT permisivas para `authenticated` que Postgres
 * combina con OR (dueno, o publicada). Si el codigo bajo prueba llamara solo
 * `.eq('id', id)` SIN `.eq('vendedor_id', ...)`, este mock deja pasar una
 * fila ajena publicada -- tal como lo haria RLS de verdad -- y la prueba de
 * "propiedad ajena" de mas abajo fallaria porque notFound() nunca se
 * llamaria. Con el filtro presente, una fila cuyo vendedor_id no coincide
 * con `uidActual` se descarta ANTES de mirar la politica, como en Postgres
 * real (un WHERE explicito se aplica ademas de RLS, no en su lugar).
 */
function clientePropiedad({
  filaPropiedad,
  uidActual = ID_USUARIO,
  barrios = [{ id: 'b1', nombre: 'El Prado' }],
}: {
  filaPropiedad: FilaPropiedadFalsa | null
  uidActual?: string
  barrios?: { id: string; nombre: string }[]
}) {
  const eqPropiedadMock = vi.fn()
  let filtros: Record<string, unknown> = {}

  const maybeSingleMock = vi.fn(async () => {
    if (!filaPropiedad) return { data: null, error: null }
    if (filtros.id !== filaPropiedad.id) return { data: null, error: null }
    if ('vendedor_id' in filtros && filtros.vendedor_id !== filaPropiedad.vendedor_id) {
      return { data: null, error: null }
    }
    const visiblePorRls =
      filaPropiedad.estado === 'publicada' || filaPropiedad.vendedor_id === uidActual
    return { data: visiblePorRls ? filaPropiedad : null, error: null }
  })

  const eqBuilderMock = vi.fn()
  const propiedadesBuilder = { eq: eqBuilderMock, maybeSingle: maybeSingleMock }
  eqBuilderMock.mockImplementation((columna: string, valor: unknown) => {
    eqPropiedadMock(columna, valor)
    filtros = { ...filtros, [columna]: valor }
    return propiedadesBuilder
  })

  const barriosOrderMock = vi.fn().mockResolvedValue({ data: barrios, error: null })
  const barriosEqMock = vi.fn()
  const barriosBuilder = { eq: barriosEqMock, order: barriosOrderMock }
  barriosEqMock.mockReturnValue(barriosBuilder)

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: uidActual } } }) },
    from: vi.fn((tabla: string) => {
      if (tabla === 'propiedades') return { select: vi.fn().mockReturnValue(propiedadesBuilder) }
      if (tabla === 'barrios') return { select: vi.fn().mockReturnValue(barriosBuilder) }
      throw new Error(`tabla inesperada en el mock: ${tabla}`)
    }),
    _eqPropiedadMock: eqPropiedadMock,
  }
}

beforeEach(() => {
  crearClienteServidor.mockReset()
  redirect.mockReset()
  notFound.mockReset()
  firmarImagenes.mockReset().mockResolvedValue(new Map())
})

function comoNextNotFound() {
  // notFound() real interrumpe la ejecucion lanzando una excepcion especial
  // (digest NEXT_NOT_FOUND); el mock reproduce ese lanzamiento.
  notFound.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
}

function comoNextRedirect() {
  redirect.mockImplementation((ruta: string) => {
    throw new Error(`NEXT_REDIRECT:${ruta}`)
  })
}

describe('metadata de /panel/propiedades/[id]', () => {
  it('no se indexa ni se sigue: es una pantalla privada', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})

describe('sin sesion', () => {
  it('redirige a /login si no hay usuario autenticado', async () => {
    const cliente = clientePropiedad({ filaPropiedad: BASE_PROPIA })
    cliente.auth.getUser = vi.fn().mockResolvedValue({ data: { user: null } })
    crearClienteServidor.mockResolvedValue(cliente)
    comoNextRedirect()

    await expect(
      PaginaEditarPropiedad({ params: Promise.resolve({ id: BASE_PROPIA.id }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/login')
  })
})

describe('seguridad: propiedad ajena (hallazgo bloqueante de la Task 11, repetido aqui)', () => {
  it('propiedad de OTRO vendedor, aunque este publicada, da notFound -- no basta con RLS', async () => {
    comoNextNotFound()
    const filaAjena: FilaPropiedadFalsa = {
      ...BASE_PROPIA,
      id: 'prop-ajena',
      vendedor_id: ID_OTRO_VENDEDOR,
      estado: 'publicada',
    }
    const cliente = clientePropiedad({ filaPropiedad: filaAjena })
    crearClienteServidor.mockResolvedValue(cliente)

    await expect(
      PaginaEditarPropiedad({ params: Promise.resolve({ id: 'prop-ajena' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')

    // Caso positivo del filtro: si el codigo hubiera omitido
    // `.eq('vendedor_id', ...)`, este mock (ver su comentario de cabecera)
    // habria dejado pasar la fila ajena por estar publicada, y la asercion
    // de arriba habria fallado -- la pagina nunca habria llamado a notFound().
    expect(cliente._eqPropiedadMock).toHaveBeenCalledWith('vendedor_id', ID_USUARIO)
  })

  it('si no existe ninguna fila con ese id, tambien da notFound', async () => {
    comoNextNotFound()
    const cliente = clientePropiedad({ filaPropiedad: null })
    crearClienteServidor.mockResolvedValue(cliente)

    await expect(
      PaginaEditarPropiedad({ params: Promise.resolve({ id: 'no-existe' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('la propia propiedad, aunque sea un borrador, SI se puede abrir (caso positivo)', async () => {
    const cliente = clientePropiedad({ filaPropiedad: BASE_PROPIA })
    crearClienteServidor.mockResolvedValue(cliente)

    const elemento = await PaginaEditarPropiedad({
      params: Promise.resolve({ id: BASE_PROPIA.id }),
    })

    expect(notFound).not.toHaveBeenCalled()
    expect(textoPlano(elemento)).toContain(BASE_PROPIA.titulo)
  })
})

describe('boton Publicar', () => {
  it('esta deshabilitado mientras falten requisitos (sin fotos ni precio)', async () => {
    const incompleta: FilaPropiedadFalsa = { ...BASE_PROPIA, precio: null, imagenes_propiedad: [] }
    const cliente = clientePropiedad({ filaPropiedad: incompleta })
    crearClienteServidor.mockResolvedValue(cliente)

    const elemento = await PaginaEditarPropiedad({ params: Promise.resolve({ id: incompleta.id }) })
    const boton = encontrarBoton(elemento, 'Publicar')

    expect(boton).not.toBeNull()
    expect(boton!.props!.disabled).toBe(true)
  })

  it('esta habilitado cuando no falta nada (caso positivo)', async () => {
    const cliente = clientePropiedad({ filaPropiedad: BASE_PROPIA })
    crearClienteServidor.mockResolvedValue(cliente)

    const elemento = await PaginaEditarPropiedad({ params: Promise.resolve({ id: BASE_PROPIA.id }) })
    const boton = encontrarBoton(elemento, 'Publicar')

    expect(boton).not.toBeNull()
    expect(boton!.props!.disabled).toBe(false)
  })

  it('una propiedad ya publicada no ofrece el boton "Publicar", si "Pausar"', async () => {
    const publicada: FilaPropiedadFalsa = { ...BASE_PROPIA, estado: 'publicada' }
    const cliente = clientePropiedad({ filaPropiedad: publicada })
    crearClienteServidor.mockResolvedValue(cliente)

    const elemento = await PaginaEditarPropiedad({ params: Promise.resolve({ id: publicada.id }) })

    expect(encontrarBoton(elemento, 'Publicar')).toBeNull()
    expect(encontrarBoton(elemento, 'Pausar')).not.toBeNull()
  })

  it('lista los faltantes visibles junto al boton', async () => {
    const incompleta: FilaPropiedadFalsa = {
      ...BASE_PROPIA, precio: null, barrio_id: null, descripcion: '', imagenes_propiedad: [],
    }
    const cliente = clientePropiedad({ filaPropiedad: incompleta })
    crearClienteServidor.mockResolvedValue(cliente)

    const elemento = await PaginaEditarPropiedad({ params: Promise.resolve({ id: incompleta.id }) })
    const texto = textoPlano(elemento)

    expect(texto).toContain('Al menos una foto')
    expect(texto).toContain('El barrio')
    expect(texto).toContain('El precio')
  })
})

describe('precio anulable: un borrador recien creado no tiene', () => {
  it('la pagina se renderiza sin reventar y muestra "Sin precio"', async () => {
    const sinPrecio: FilaPropiedadFalsa = { ...BASE_PROPIA, precio: null }
    const cliente = clientePropiedad({ filaPropiedad: sinPrecio })
    crearClienteServidor.mockResolvedValue(cliente)

    const elemento = await PaginaEditarPropiedad({ params: Promise.resolve({ id: sinPrecio.id }) })

    expect(textoPlano(elemento)).toContain('Sin precio')
  })

  it('FormularioDatos recibe el precio null tal cual, sin transformarlo', async () => {
    const sinPrecio: FilaPropiedadFalsa = { ...BASE_PROPIA, precio: null }
    const cliente = clientePropiedad({ filaPropiedad: sinPrecio })
    crearClienteServidor.mockResolvedValue(cliente)

    const elemento = await PaginaEditarPropiedad({ params: Promise.resolve({ id: sinPrecio.id }) })
    const nodoFormulario = buscarNodo(elemento, (el) => el.type === FormularioDatos)

    expect(nodoFormulario).not.toBeNull()
    const propiedadProp = nodoFormulario!.props!.propiedad as { precio: number | null }
    expect(propiedadProp.precio).toBeNull()
  })

  // valorInicialNumerico es la funcion pura que usa el input de precio (y
  // habitaciones/banos/area_m2) para su defaultValue. Se exporta aparte
  // porque FormularioDatos es un componente cliente con hooks -- no se puede
  // invocar fuera de un render real (por eso esta prueba, y no una que
  // renderice el formulario, es la que de verdad demuestra "no revienta").
  it('valorInicialNumerico normaliza null a cadena vacia, no a NaN ni a un throw', () => {
    expect(valorInicialNumerico(null)).toBe('')
  })

  it('valorInicialNumerico conserva un numero real tal cual', () => {
    expect(valorInicialNumerico(250000000)).toBe(250000000)
  })
})

describe('imagenes: URL firmada, nunca publica', () => {
  it('PanelFotos recibe la URL firmada devuelta por firmarImagenes, no una URL publica de Storage', async () => {
    const ruta = BASE_PROPIA.imagenes_propiedad[0]!.ruta_storage
    const urlFirmada =
      `https://proyecto.supabase.co/storage/v1/object/sign/propiedades/${ruta}?token=abc123`
    firmarImagenes.mockResolvedValue(new Map([[ruta, urlFirmada]]))
    const cliente = clientePropiedad({ filaPropiedad: BASE_PROPIA })
    crearClienteServidor.mockResolvedValue(cliente)

    const elemento = await PaginaEditarPropiedad({ params: Promise.resolve({ id: BASE_PROPIA.id }) })
    const nodoFotos = buscarNodo(elemento, (el) => el.type === PanelFotos)

    expect(nodoFotos).not.toBeNull()
    const imagenes = nodoFotos!.props!.imagenes as { url: string | null }[]
    expect(imagenes).toHaveLength(1)
    expect(imagenes[0]!.url).toBe(urlFirmada)
    // El bucket es privado (ver firmar.ts): nunca una URL /object/public/
    // construida a mano por este codigo.
    expect(imagenes[0]!.url).not.toContain('/object/public/')

    // Y lo que se le pide a firmarImagenes es la ruta cruda de la base, no
    // una URL ya armada.
    expect(firmarImagenes).toHaveBeenCalledWith([ruta])
  })

  it('si firmarImagenes no logra firmar una ruta, la imagen llega con url null (nunca una URL inventada)', async () => {
    firmarImagenes.mockResolvedValue(new Map())
    const cliente = clientePropiedad({ filaPropiedad: BASE_PROPIA })
    crearClienteServidor.mockResolvedValue(cliente)

    const elemento = await PaginaEditarPropiedad({ params: Promise.resolve({ id: BASE_PROPIA.id }) })
    const nodoFotos = buscarNodo(elemento, (el) => el.type === PanelFotos)
    const imagenes = nodoFotos!.props!.imagenes as { url: string | null }[]

    expect(imagenes[0]!.url).toBeNull()
  })

  it('sin fotos, PanelFotos recibe una lista vacia', async () => {
    const sinFotos: FilaPropiedadFalsa = { ...BASE_PROPIA, imagenes_propiedad: [] }
    const cliente = clientePropiedad({ filaPropiedad: sinFotos })
    crearClienteServidor.mockResolvedValue(cliente)

    const elemento = await PaginaEditarPropiedad({ params: Promise.resolve({ id: sinFotos.id }) })
    const nodoFotos = buscarNodo(elemento, (el) => el.type === PanelFotos)

    expect((nodoFotos!.props!.imagenes as unknown[])).toEqual([])
  })
})
