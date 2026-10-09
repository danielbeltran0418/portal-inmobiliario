import { describe, it, expect } from 'vitest'
import { codigoTotp } from '../compartido/totp'

// Vectores del apendice B de RFC 6238 (SHA-1, secreto "12345678901234567890"),
// recortados a 6 digitos.
const SECRETO = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('codigoTotp', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('t=%i -> %s', (segundos, esperado) => {
    expect(codigoTotp(SECRETO, segundos * 1000)).toBe(esperado)
  })
})
