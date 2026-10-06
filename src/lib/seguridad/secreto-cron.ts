import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Valida la cabecera Authorization de una ruta de cron contra CRON_SECRET.
 *
 * Compara los SHA-256 de ambos valores con timingSafeEqual: el hash iguala la
 * longitud (timingSafeEqual lanza si difieren) y la comparacion no filtra por
 * tiempo cuantos caracteres coinciden. Sin secreto configurado falla cerrado.
 */
export function cronAutorizado(authHeader: string | null, secreto: string | undefined): boolean {
  if (!secreto) return false
  const huella = (valor: string) => createHash('sha256').update(valor).digest()
  return timingSafeEqual(huella(authHeader ?? ''), huella(`Bearer ${secreto}`))
}
