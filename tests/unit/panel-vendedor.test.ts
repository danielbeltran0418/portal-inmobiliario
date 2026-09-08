import { describe, it, expect, vi, beforeEach } from 'vitest'
import { filasDelPanel, textoPrecio, type PropiedadCruda } from '@/lib/propiedades/panel'

const crearClienteServidor = vi.fn()

// Mismo patron que tests/unit/accion-propiedades.test.ts: crearClienteServidor
// (via next/headers) se mockea ANTES de importar el modulo que la consume, y
// la pagina se importa dinamicamente despues del mock.
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor }))

const { default: PaginaPanelVendedor } = await import('@/app/(vendedor)/panel/page')

const BASE: PropiedadCruda = {
  id: '1',
  titulo: 'Apartamento en el Prado',
  estado: 'borrador',
  precio: 250000000,
  barrio_id: '11111111-1111-1111-1111-111111111111',
  descripcion: 'Una descripcion con suficiente detalle para el catalogo.',
  imagenes_propiedad: [{ id: 'img-1' }],
}

describe('textoPrecio', () => {
  it('sin precio (null, como nace un borrador nuevo) muestra "Sin precio" y no revienta', () => {
    expect(textoPrecio(null)).toBe('Sin precio')
  })

  it('con precio lo formatea como moneda', () => {
    expect(textoPrecio(250000000)).toMatch(/250/)
  })
})

describe('filasDelPanel', () => {
  it('una propiedad sin precio se muestra como "Sin precio" y no revienta', () => {
    const [fila] = filasDelPanel([{ ...BASE, precio: null }])
    expect(fila!.precioTexto).toBe('Sin precio')
  })

  it('lista todos los faltantes de un borrador incompleto', () => {
    const [fila] = filasDelPanel([{
      ...BASE, precio: null, barrio_id: null, descripcion: '', imagenes_propiedad: [],
    }])
    expect(fila!.faltantes).toEqual([
      'Al menos una foto',
      'El barrio',
      'El precio',
      'Una descripcion de al menos 40 caracteres',
    ])
  })

  it('una propiedad completa (no publicada) no muestra faltantes', () => {
    const [fila] = filasDelPanel([BASE])
    expect(fila!.faltantes).toEqual([])
  })

  /**
   * faltantesParaPublicar (Task 5) tambien senala barrio y descripcion, pero
   * esos dos son solo guia del panel: la base solo exige foto y precio para
   * publicar (ver el comentario de faltaParaPublicar en acciones.ts). Una
   * propiedad YA publicada no debe mostrar faltantes aunque le falten esos
   * dos campos de guia -- confundiria al vendedor sobre algo que ya logro.
   */
  it('una propiedad publicada nunca muestra faltantes, aunque le falte barrio o descripcion', () => {
    const [fila] = filasDelPanel([{
      ...BASE, estado: 'publicada', barrio_id: null, descripcion: '',
    }])
    expect(fila!.faltantes).toEqual([])
  })

  it('etiqueta el estado en español', () => {
    expect(filasDelPanel([{ ...BASE, estado: 'pausada' }])[0]!.estadoTexto).toBe('Pausada')
    expect(filasDelPanel([{ ...BASE, estado: 'publicada' }])[0]!.estadoTexto).toBe('Publicada')
    expect(filasDelPanel([{ ...BASE, estado: 'vendida' }])[0]!.estadoTexto).toBe('Vendida')
  })

  it('sin propiedades devuelve una lista vacia', () => {
    expect(filasDelPanel([])).toEqual([])
  })
})

/**
 * Extrae el texto plano de un arbol de elementos de React SIN renderizarlo a
 * DOM: este proyecto no usa @testing-library (entorno vitest 'node', sin
 * jsdom), asi que se camina el arbol de objetos que produce JSX -- cada
 * elemento es `{ props: { children } }` -- igual de valido para comprobar
 * que un texto aparece en la salida que inspeccionar un DOM.
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

const ID_USUARIO = 'usuario-de-prueba-11111111-1111-1111-1111-111111111111'

/**
 * `.eq('vendedor_id', ...)` es el arreglo del hallazgo bloqueante: el panel
 * NO puede confiar solo en RLS (ver el comentario de page.tsx). `builder`
 * imita el encadenado real de PostgREST-js, donde `.eq()` y `.order()`
 * cuelgan del mismo objeto y cualquiera puede llamarse sin el otro -- asi,
 * si alguien quita el `.eq('vendedor_id', ...)` del codigo, la cadena NO
 * revienta (seguiria compilando una consulta sin filtro, que es justo el
 * bug), y la prueba de mas abajo lo detecta por una asercion clara
 * (`eqMock` sin llamar) en vez de un TypeError que tumbe toda la suite.
 */
function clienteFalso(data: unknown[]) {
  const orderMock = vi.fn().mockResolvedValue({ data, error: null })
  const eqMock = vi.fn()
  const builder = { eq: eqMock, order: orderMock }
  eqMock.mockReturnValue(builder)
  const selectMock = vi.fn().mockReturnValue(builder)
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: ID_USUARIO } } }) },
    from: vi.fn().mockReturnValue({ select: selectMock }),
    _selectMock: selectMock,
    _eqMock: eqMock,
    _orderMock: orderMock,
  }
}

describe('PaginaPanelVendedor', () => {
  beforeEach(() => {
    crearClienteServidor.mockReset()
  })

  it('sin ninguna propiedad renderiza el texto de ayuda, no una pagina en blanco', async () => {
    crearClienteServidor.mockResolvedValue(clienteFalso([]))

    const elemento = await PaginaPanelVendedor()
    const texto = textoPlano(elemento)

    expect(texto).toContain('Todavía no has publicado ninguna propiedad')
    expect(texto.trim().length).toBeGreaterThan(0)
  })

  it('con propiedades muestra titulo, precio, estado y el enlace para crear una nueva', async () => {
    crearClienteServidor.mockResolvedValue(clienteFalso([
      {
        id: 'p1',
        titulo: 'Casa en Villa Carolina',
        estado: 'borrador',
        precio: null,
        barrio_id: null,
        descripcion: '',
        imagenes_propiedad: [],
      },
    ]))

    const elemento = await PaginaPanelVendedor()
    const texto = textoPlano(elemento)

    expect(texto).toContain('Casa en Villa Carolina')
    expect(texto).toContain('Sin precio')
    expect(texto).toContain('Borrador')
    expect(texto).toContain('Al menos una foto')
    expect(texto).not.toContain('Todavía no has publicado ninguna propiedad')
  })

  it('ordena la consulta por actualizado_en descendente', async () => {
    const cliente = clienteFalso([])
    crearClienteServidor.mockResolvedValue(cliente)

    await PaginaPanelVendedor()

    expect(cliente._orderMock).toHaveBeenCalledWith('actualizado_en', { ascending: false })
  })

  /**
   * Hallazgo bloqueante de la Task 11: RLS por si sola NO filtra "propiedades"
   * por dueño (dos politicas SELECT permisivas para `authenticated` se
   * combinan con OR -- ver tests/rls/propiedades.test.ts, "SIN filtro
   * explicito"). El panel tiene que filtrar el mismo, con el id del usuario
   * autenticado, o "mis propiedades" muestra tambien las publicadas de otros.
   */
  it('filtra la consulta por vendedor_id, con el id del usuario autenticado', async () => {
    const cliente = clienteFalso([])
    crearClienteServidor.mockResolvedValue(cliente)

    await PaginaPanelVendedor()

    expect(cliente.auth.getUser).toHaveBeenCalled()
    expect(cliente._eqMock).toHaveBeenCalledWith('vendedor_id', ID_USUARIO)
  })

  it('el enlace a /panel/propiedades/nueva siempre esta presente', async () => {
    crearClienteServidor.mockResolvedValue(clienteFalso([]))

    const elemento = await PaginaPanelVendedor()

    // Igual de valido que buscar un <a href>: aqui el elemento es de
    // next/link, cuyo prop es `href`, no un atributo DOM -- caminamos el
    // arbol buscando ese prop en vez de renderizar a HTML.
    function tieneEnlaceA(nodo: unknown, destino: string): boolean {
      if (nodo === null || nodo === undefined || typeof nodo !== 'object') return false
      if (Array.isArray(nodo)) return nodo.some((n) => tieneEnlaceA(n, destino))
      const props = (nodo as { props?: Record<string, unknown> }).props
      if (!props) return false
      if (props.href === destino) return true
      return tieneEnlaceA(props.children, destino)
    }

    expect(tieneEnlaceA(elemento, '/panel/propiedades/nueva')).toBe(true)
  })
})
