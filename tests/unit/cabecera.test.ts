import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { rutaDePanel, type Rol } from '@/lib/auth/roles'
import {
  enlaceDePanel,
  estadoDeCabecera,
  ENLACE_ENTRAR,
  ENLACE_REGISTRO,
} from '@/lib/navegacion/enlaces'
import type { Sesion } from '@/lib/auth/sesion'

/** Buffer aqui es codigo de prueba corriendo en Node: legitimo. */
function tokenConRol(rol: string): string {
  const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${parte({ alg: 'HS256' })}.${parte({ app_metadata: { rol } })}.firma`
}

function conSesion(rol: string): Sesion {
  return { hayUsuario: true, accessToken: tokenConRol(rol) }
}

const SIN_SESION: Sesion = { hayUsuario: false, accessToken: null }

const destinos = (enlaces: readonly { destino: string }[]) => enlaces.map((e) => e.destino)

describe('enlaceDePanel', () => {
  it('lleva a cada rol a su propio panel, con su nombre visible', () => {
    expect(enlaceDePanel(conSesion('comprador'))).toEqual({
      etiqueta: 'Mi cuenta',
      destino: '/mi-cuenta',
    })
    expect(enlaceDePanel(conSesion('vendedor'))).toEqual({
      etiqueta: 'Panel',
      destino: '/panel',
    })
    expect(enlaceDePanel(conSesion('super_admin'))).toEqual({
      etiqueta: 'Control',
      destino: '/control',
    })
  })

  /**
   * Lo que esta prueba fija no es el valor -- eso ya lo hace la de arriba --
   * sino que el destino SALE de rutaDePanel y no de una segunda tabla escrita
   * aparte. Si alguien copia la correspondencia rol -> ruta dentro de
   * enlaces.ts y luego cambia RUTAS_PROTEGIDAS, la cabecera ofreceria un
   * enlace que el middleware rechaza; aqui eso se cae.
   */
  it('el destino es exactamente el que resuelve rutaDePanel', () => {
    const roles: Rol[] = ['comprador', 'vendedor', 'super_admin']
    for (const rol of roles) {
      expect(enlaceDePanel(conSesion(rol))!.destino).toBe(rutaDePanel(rol))
    }
  })

  it('no hay panel sin sesion', () => {
    expect(enlaceDePanel(SIN_SESION)).toBeNull()
  })

  /**
   * El caso que de verdad importa de los dos anteriores: un access token en la
   * cookie NO es prueba de sesion -- la cookie la manda el navegador. Solo
   * cuenta hayUsuario, que viene de getUser() (revalidado contra el servidor
   * de auth). Sin esto, pegar un JWT cualquiera en la cookie haria que la
   * cabecera anunciara el panel del super admin.
   */
  it('un token en la cookie sin usuario validado NO abre panel', () => {
    const soloCookie: Sesion = { hayUsuario: false, accessToken: tokenConRol('super_admin') }
    expect(enlaceDePanel(soloCookie)).toBeNull()
  })

  it('cae en el rol de menos privilegio si el token es ilegible', () => {
    expect(enlaceDePanel({ hayUsuario: true, accessToken: 'no-es-un-token' })).toEqual({
      etiqueta: 'Mi cuenta',
      destino: '/mi-cuenta',
    })
    expect(enlaceDePanel({ hayUsuario: true, accessToken: null })).toEqual({
      etiqueta: 'Mi cuenta',
      destino: '/mi-cuenta',
    })
  })
})

describe('estadoDeCabecera', () => {
  describe('sin sesion', () => {
    const estado = estadoDeCabecera(SIN_SESION)

    it('ofrece las dos puertas de entrada', () => {
      expect(estado.autenticado).toBe(false)
      expect(estado.enlaces).toEqual([ENLACE_ENTRAR, ENLACE_REGISTRO])
      expect(destinos(estado.enlaces)).toEqual(['/login', '/registro'])
    })

    it('no ofrece ningun panel', () => {
      expect(destinos(estado.enlaces)).not.toContain('/mi-cuenta')
      expect(destinos(estado.enlaces)).not.toContain('/panel')
      expect(destinos(estado.enlaces)).not.toContain('/control')
    })
  })

  describe('con sesion', () => {
    const estado = estadoDeCabecera(conSesion('vendedor'))

    it('ofrece el panel del rol', () => {
      expect(estado.autenticado).toBe(true)
      expect(estado.enlaces).toEqual([{ etiqueta: 'Panel', destino: '/panel' }])
    })

    /**
     * El lado negativo, en pareja con el positivo de arriba: con sesion
     * abierta, "Entrar" y "Crear cuenta" desaparecen. Sin esta asercion, una
     * cabecera que enseñara SIEMPRE los cinco enlaces pasaria la prueba
     * anterior.
     */
    it('retira las puertas de entrada de anonimo', () => {
      expect(destinos(estado.enlaces)).not.toContain('/login')
      expect(destinos(estado.enlaces)).not.toContain('/registro')
    })

    it('no ofrece el panel de otro rol', () => {
      expect(destinos(estadoDeCabecera(conSesion('comprador')).enlaces)).toEqual(['/mi-cuenta'])
      expect(destinos(estadoDeCabecera(conSesion('super_admin')).enlaces)).toEqual(['/control'])
    })
  })
})

/**
 * El control de cerrar sesion no es un enlace sino un formulario que envia un
 * server action, y eso es una decision de SEGURIDAD, no de estilo: un GET lo
 * puede disparar un tercero desde otra pagina (<img src>) y lo disparan solos
 * los prefetchers. Ver el comentario largo de acciones-sesion.ts.
 *
 * La prueba e2e comprueba que cerrar sesion FUNCIONA; esta comprueba que se
 * hace por el camino correcto, que es algo que un e2e con el navegador no
 * distingue: un <a href> que cerrara sesion tambien pasaria alli.
 */
describe('el cierre de sesion no viaja por GET', () => {
  const fuente = (relativa: string) =>
    readFileSync(path.join(process.cwd(), relativa), 'utf8')

  it('la accion esta declarada como server action', () => {
    const codigo = fuente('src/componentes/acciones-sesion.ts')
    expect(codigo.trimStart().startsWith("'use server'")).toBe(true)
    expect(codigo).toContain('signOut()')
  })

  it('la cabecera lo envia con un <form>, no con un <Link> ni un <a>', () => {
    const codigo = fuente('src/componentes/cabecera.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

    expect(codigo).toMatch(/<form\s+action=\{cerrarSesion\}>/)
    expect(codigo).not.toMatch(/href=\{[^}]*cerrarSesion/)
    expect(codigo).not.toMatch(/href="\/(salir|logout|cerrar-sesion)"/)
  })

  it('no existe ningun route handler de cierre de sesion', () => {
    // Un GET /salir reintroduciria exactamente el agujero que el server action
    // evita, y lo haria sin tocar ninguno de los dos archivos de arriba.
    for (const ruta of ['src/app/salir', 'src/app/logout', 'src/app/cerrar-sesion']) {
      expect(() => fuente(path.join(ruta, 'route.ts'))).toThrow()
    }
  })
})
