import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { rolDesdeToken, rutaPermitida, rutaDePanel, decodificarBase64Url } from '@/lib/auth/roles'

function tokenFalso(claims: object): string {
  const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${parte({ alg: 'HS256' })}.${parte(claims)}.firma`
}

describe('rolDesdeToken', () => {
  it('lee el rol del claim app_metadata', () => {
    expect(rolDesdeToken(tokenFalso({ app_metadata: { rol: 'vendedor' } }))).toBe('vendedor')
  })

  it('cae en comprador si el claim no existe', () => {
    expect(rolDesdeToken(tokenFalso({}))).toBe('comprador')
  })

  it('cae en comprador ante un rol desconocido', () => {
    expect(rolDesdeToken(tokenFalso({ app_metadata: { rol: 'dios' } }))).toBe('comprador')
  })

  it('cae en comprador ante un token corrupto', () => {
    expect(rolDesdeToken('no-es-un-token')).toBe('comprador')
  })

  // Esta prueba es la razon de ser del paso TextDecoder. Llama a
  // decodificarBase64Url DIRECTAMENTE, y por eso hay que exportarla: a traves de
  // rolDesdeToken el fallo es inobservable, porque esa funcion solo devuelve el
  // rol y todos los roles son ASCII, donde TextDecoder y String.fromCharCode
  // coinciden. Sustituir TextDecoder por String.fromCharCode convierte 'José' en
  // 'JosÃ©', y esta prueba lo detecta.
  it('decodificarBase64Url maneja tildes y ñ sin corromperlos', () => {
    const carga = JSON.stringify({ nombre: 'José Muñoz Peñaranda' })
    // Buffer aqui es codigo de prueba corriendo en Node: legitimo.
    const codificado = Buffer.from(carga, 'utf8').toString('base64url')

    const decodificado = JSON.parse(decodificarBase64Url(codificado)) as {
      nombre: string
    }
    expect(decodificado.nombre).toBe('José Muñoz Peñaranda')
  })
})

describe('rutaPermitida', () => {
  it('el vendedor entra a su panel', () => {
    expect(rutaPermitida('/panel', 'vendedor')).toBe(true)
  })

  it('el comprador NO entra al panel del vendedor', () => {
    expect(rutaPermitida('/panel', 'comprador')).toBe(false)
  })

  it('el vendedor NO entra al control del super admin', () => {
    expect(rutaPermitida('/control', 'vendedor')).toBe(false)
  })

  it('el super admin entra al control', () => {
    expect(rutaPermitida('/control', 'super_admin')).toBe(true)
  })

  it('el comprador entra a mi-cuenta', () => {
    expect(rutaPermitida('/mi-cuenta', 'comprador')).toBe(true)
  })

  it('las rutas publicas quedan abiertas para cualquier rol', () => {
    expect(rutaPermitida('/', 'comprador')).toBe(true)
    expect(rutaPermitida('/propiedades/casa-en-riomar', 'vendedor')).toBe(true)
  })

  it('cubre las subrutas del panel', () => {
    expect(rutaPermitida('/panel/publicaciones/nueva', 'comprador')).toBe(false)
    expect(rutaPermitida('/panel/publicaciones/nueva', 'vendedor')).toBe(true)
  })

  it('NO protege rutas que solo comparten prefijo de letras', () => {
    expect(rutaPermitida('/panelx', 'comprador')).toBe(true)
    expect(rutaPermitida('/panel-publico', 'comprador')).toBe(true)
    expect(rutaPermitida('/paneles-publicos', 'comprador')).toBe(true)
  })
})

describe('rutaDePanel', () => {
  it('lleva a cada rol a su propio inicio', () => {
    expect(rutaDePanel('comprador')).toBe('/mi-cuenta')
    expect(rutaDePanel('vendedor')).toBe('/panel')
    expect(rutaDePanel('super_admin')).toBe('/control')
  })
})

describe('compatibilidad con el runtime Edge', () => {
  it('el modulo fuente no usa APIs exclusivas de Node (Buffer, require, node:*)', () => {
    // Este test lee el ARCHIVO FUENTE (no el helper de prueba de arriba, que si
    // usa Buffer porque corre en Node). src/lib/auth/roles.ts lo importa
    // src/middleware.ts, que corre en el runtime Edge, donde Buffer/require/los
    // modulos node: no existen. Las coincidencias dentro de comentarios se
    // descartan para no generar falsos positivos con comentarios explicativos.
    const rutaModulo = path.join(process.cwd(), 'src/lib/auth/roles.ts')
    const codigoFuente = readFileSync(rutaModulo, 'utf-8')
    const sinComentarios = codigoFuente
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

    expect(sinComentarios).not.toMatch(/\bBuffer\b/)
    expect(sinComentarios).not.toMatch(/\brequire\(/)
    expect(sinComentarios).not.toMatch(/from\s+['"]node:/)
  })
})
