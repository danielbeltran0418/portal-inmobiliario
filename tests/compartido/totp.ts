import { createHmac } from 'node:crypto'

/**
 * Codigo TOTP (RFC 6238: SHA-1, 6 digitos, pasos de 30 s) a partir del
 * secreto en base32 que devuelve Supabase Auth al dar de alta el factor.
 * Lo usan las pruebas de RLS y las e2e para obtener sesiones aal2 de
 * super_admin sin un telefono de por medio.
 */
export function codigoTotp(secretoBase32: string, ahoraMs: number = Date.now()): string {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const caracter of secretoBase32.replace(/=+$/, '').toUpperCase()) {
    const valor = alfabeto.indexOf(caracter)
    if (valor < 0) throw new Error('Secreto TOTP con caracteres fuera de base32')
    bits += valor.toString(2).padStart(5, '0')
  }
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))

  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(Math.floor(ahoraMs / 1000 / 30)))

  const hmac = createHmac('sha1', bytes).update(contador).digest()
  const desplazamiento = hmac[hmac.length - 1]! & 0x0f
  const numero = (hmac.readUInt32BE(desplazamiento) & 0x7fffffff) % 1_000_000
  return numero.toString().padStart(6, '0')
}
