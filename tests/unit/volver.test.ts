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
})
