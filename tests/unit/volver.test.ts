import { describe, it, expect } from 'vitest'
import { rutaDeRetorno } from '@/lib/navegacion/volver'

describe('rutaDeRetorno', () => {
  it('acepta una ruta interna', () => {
    expect(rutaDeRetorno('/riomar/casa-abc')).toBe('/riomar/casa-abc')
  })

  // Los tres que importan: cada uno es un redirect abierto si pasa.
  it('rechaza una URL absoluta externa', () => {
    expect(rutaDeRetorno('https://malo.test/phishing')).toBe('/')
  })

  it('rechaza el doble slash, que el navegador lee como protocolo relativo', () => {
    expect(rutaDeRetorno('//malo.test/phishing')).toBe('/')
  })

  it('rechaza la barra invertida, que algunos navegadores normalizan a /', () => {
    expect(rutaDeRetorno('/\\malo.test')).toBe('/')
    expect(rutaDeRetorno('\\\\malo.test')).toBe('/')
  })

  it('rechaza null y la cadena vacia', () => {
    expect(rutaDeRetorno(null)).toBe('/')
    expect(rutaDeRetorno('')).toBe('/')
  })

  // El URL Standard obliga a los navegadores a ELIMINAR tab, salto de linea y
  // retorno de carro de una URL antes de resolverla. Sin este chequeo,
  // "/\t/malo.test" pasa "empieza por /", "no empieza por //" y "sin
  // contrabarra" tal cual -- pero el navegador lo resuelve como
  // "//malo.test": protocolo relativo, fuera del dominio. Los literales de
  // abajo usan el caracter de control REAL (asi es como '\t', '\n' y '\r' se
  // interpretan dentro de un string de un solo caracter de escape en JS/TS),
  // no una secuencia de escape de dos caracteres.
  it('rechaza el tabulador, que el navegador elimina antes de resolver la URL', () => {
    expect(rutaDeRetorno('/\t/malo.test')).toBe('/')
  })

  it('rechaza el salto de linea, que el navegador elimina antes de resolver la URL', () => {
    expect(rutaDeRetorno('/\n/malo.test')).toBe('/')
  })

  it('rechaza el retorno de carro, que el navegador elimina antes de resolver la URL', () => {
    expect(rutaDeRetorno('/\r/malo.test')).toBe('/')
  })

  // El espacio es parte del mismo rango rechazado (C0 + espacio), y aparece
  // en cualquier posicion, no solo al principio de la ruta.
  it('rechaza el espacio inicial antes de una ruta interna', () => {
    expect(rutaDeRetorno(' /malo.test')).toBe('/')
  })

  it('rechaza el espacio inicial antes de un protocolo relativo', () => {
    expect(rutaDeRetorno(' //malo.test')).toBe('/')
  })

  // Control: una ruta interna legitima, sin espacios ni caracteres de
  // control, sigue aceptandose. Esto no es "rechazar todo".
  it('sigue aceptando una ruta interna legitima tras el chequeo de controles', () => {
    expect(rutaDeRetorno('/panel/propiedades/nueva')).toBe('/panel/propiedades/nueva')
  })
})
