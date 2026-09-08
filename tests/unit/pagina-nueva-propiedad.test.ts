import { describe, it, expect, vi } from 'vitest'

const crearClienteServidor = vi.fn()
const crearClienteAdmin = vi.fn()
const redirect = vi.fn()
const revalidatePath = vi.fn()

// nueva/page.tsx renderiza FormularioNuevaPropiedad, que importa crearBorrador
// de '../acciones' -- ese modulo importa a su vez crearClienteAdmin
// (@/lib/supabase/cliente-admin), que declara 'server-only'. Igual que en
// tests/unit/accion-propiedades.test.ts: sin este mock, la sola importacion
// de la pagina revienta bajo Vitest/Node, no solo la llamada a la funcion.
vi.mock('@/lib/supabase/cliente-servidor', () => ({ crearClienteServidor }))
vi.mock('@/lib/supabase/cliente-admin', () => ({ crearClienteAdmin }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('next/cache', () => ({ revalidatePath }))

const { default: PaginaNuevaPropiedad, metadata } = await import(
  '@/app/(vendedor)/panel/propiedades/nueva/page'
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

describe('metadata de /panel/propiedades/nueva', () => {
  it('no se indexa ni se sigue: es una pantalla privada', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('declara title y description propios', () => {
    expect(typeof metadata.title).toBe('string')
    expect((metadata.title as string).length).toBeGreaterThan(0)
    expect(typeof metadata.description).toBe('string')
    expect((metadata.description as string).length).toBeGreaterThan(0)
  })
})

describe('PaginaNuevaPropiedad', () => {
  it('renderiza el titulo y el formulario de alta sin llamar a la base', () => {
    const elemento = PaginaNuevaPropiedad()
    const texto = textoPlano(elemento)

    expect(texto).toContain('Nueva propiedad')
    // Es un server component SIN await ni consulta: solo pinta el formulario
    // de cliente, que es quien luego llama a crearBorrador al enviarse.
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })
})
