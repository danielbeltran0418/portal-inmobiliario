import { describe, it, expect, vi } from 'vitest'
import type { Metadata } from 'next'

// /login y /registro importan @/lib/seguridad/turnstile, que declara
// 'server-only' -- un modulo que solo resuelve dentro del bundler de Next.
// Mismo mock que en tests/unit/accion-login.test.ts.
vi.mock('server-only', () => ({}))

/**
 * Metadatos por pagina.
 *
 * tests/unit/metadatos-layout.test.ts vigila el layout raiz, que es solo el
 * valor por defecto: sin esto, las seis rutas compartirian el mismo title y la
 * misma description, que es lo que aparece en la pestaña del navegador, en un
 * resultado de busqueda y en la vista previa de un enlace compartido.
 *
 * Y las tres rutas privadas tienen ademas una obligacion que no es cosmetica:
 * `robots: { index: false, follow: false }`. Un panel indexado filtra a un
 * buscador la existencia y la estructura de la parte privada del portal.
 */

interface Pagina {
  readonly ruta: string
  readonly modulo: string
  readonly privada: boolean
}

const PAGINAS: readonly Pagina[] = [
  { ruta: '/', modulo: '../../src/app/page', privada: false },
  { ruta: '/login', modulo: '../../src/app/(auth)/login/page', privada: false },
  { ruta: '/registro', modulo: '../../src/app/(auth)/registro/page', privada: false },
  {
    ruta: '/verificar-correo',
    modulo: '../../src/app/(auth)/verificar-correo/page',
    privada: false,
  },
  { ruta: '/mi-cuenta', modulo: '../../src/app/(comprador)/mi-cuenta/page', privada: true },
  { ruta: '/panel', modulo: '../../src/app/(vendedor)/panel/page', privada: true },
  { ruta: '/control', modulo: '../../src/app/(admin)/control/page', privada: true },
]

async function metadatosDe(pagina: Pagina): Promise<Metadata> {
  const modulo = (await import(pagina.modulo)) as { metadata?: Metadata }
  return modulo.metadata ?? {}
}

describe('metadatos por pagina', () => {
  it.each(PAGINAS)('$ruta declara title y description propios', async (pagina) => {
    const metadatos = await metadatosDe(pagina)

    expect(typeof metadatos.title).toBe('string')
    expect(metadatos.title as string).not.toHaveLength(0)
    expect(typeof metadatos.description).toBe('string')
    expect(metadatos.description as string).not.toHaveLength(0)
  })

  it('ninguna pagina repite el title de otra', async () => {
    const titulos = await Promise.all(
      PAGINAS.map(async (pagina) => (await metadatosDe(pagina)).title as string),
    )

    expect(new Set(titulos).size).toBe(PAGINAS.length)
  })

  describe('robots', () => {
    const privadas = PAGINAS.filter((p) => p.privada)
    const publicas = PAGINAS.filter((p) => !p.privada)

    it.each(privadas)('$ruta no se indexa ni se sigue', async (pagina) => {
      const metadatos = await metadatosDe(pagina)
      expect(metadatos.robots).toEqual({ index: false, follow: false })
    })

    /**
     * El lado positivo, en pareja con el de arriba. Sin esto, poner
     * `robots: { index: false }` en TODAS las paginas -- incluida la landing,
     * que es justo la que tiene que salir en Google -- pasaria la prueba
     * anterior sin que nadie se enterara.
     */
    it.each(publicas)('$ruta si es indexable', async (pagina) => {
      const metadatos = await metadatosDe(pagina)
      const robots = metadatos.robots as { index?: boolean } | undefined

      // O no declara robots (indexable por defecto) o lo declara permitiendo
      // el indexado. Lo que no vale es index: false.
      expect(robots?.index).not.toBe(false)
    })
  })
})
