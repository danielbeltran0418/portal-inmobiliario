import { describe, it, expect, vi } from 'vitest'

// next/font/google es un import que solo resuelve dentro del compilador de
// Next. Se sustituye por lo minimo que el layout consume: no se esta probando
// la tipografia.
vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: 'geist' }),
  Geist_Mono: () => ({ variable: 'geist-mono' }),
}))

/**
 * Guarda del criterio de aceptacion 8 (la CSP no rompe la aplicacion).
 *
 * Un nonce de CSP cambia en cada peticion, asi que una pagina prerenderizada
 * durante el build no puede llevarlo. Si el layout raiz deja de declarar
 * force-dynamic, `next build` vuelve a escribir .next/server/app/login.html y
 * `next start` sirve ese HTML tal cual: sus <script> salen sin nonce y, como la
 * politica lleva 'strict-dynamic' (que hace que el navegador ignore 'self'),
 * quedan bloqueados y la pagina no hidrata.
 *
 * Verificado empiricamente: sin force-dynamic, 0 de 10 <script> llevaban nonce
 * y el navegador reporto 10 violaciones de CSP.
 *
 * Esto NO lo cubre la suite e2e: corre contra `npm run dev`, donde todo se
 * renderiza dinamicamente y el fallo no se manifiesta. Se comprueba aqui sobre
 * el mecanismo real -- la configuracion de segmento que lee Next -- y no sobre
 * el texto del archivo.
 */
describe('render dinamico del layout raiz', () => {
  it('el layout raiz declara force-dynamic', async () => {
    const layout = await import('../../src/app/layout')
    expect(layout.dynamic).toBe('force-dynamic')
  })
})
