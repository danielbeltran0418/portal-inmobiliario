import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const transaccion = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), reference: z.string().uuid(), amount_in_cents: z.number().int().positive().safe(), currency: z.literal('COP'), status: z.enum(['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR']) })
export const esquemaEventoWompi = z.object({
  event: z.literal('transaction.updated'), environment: z.enum(['test', 'prod']),
  data: z.object({ transaction: transaccion.passthrough() }).passthrough(),
  timestamp: z.number().int().positive().safe(),
  signature: z.object({ properties: z.array(z.string().max(150)).min(1).max(20), checksum: z.string().regex(/^[a-fA-F0-9]{64}$/) }),
})
export const esquemaRespuestaTransaccion = z.object({ data: transaccion })
export type EventoWompi = z.infer<typeof esquemaEventoWompi>

export function firmaCheckout(referencia: string, centavos: number, secreto: string, expiracion: string): string {
  return createHash('sha256').update(`${referencia}${centavos}COP${expiracion}${secreto}`).digest('hex')
}
export function verificarEvento(evento: EventoWompi, secreto: string): boolean {
  if (!secreto) return false
  let valores = ''
  for (const ruta of evento.signature.properties) {
    if (!/^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$/.test(ruta)) return false
    let valor: unknown = evento.data
    for (const parte of ruta.split('.')) {
      if (!valor || typeof valor !== 'object' || !Object.hasOwn(valor, parte)) return false
      valor = (valor as Record<string, unknown>)[parte]
    }
    if (typeof valor !== 'string' && typeof valor !== 'number') return false
    valores += String(valor)
  }
  // Exigir firma del ID, estado y monto; los demás campos se contrastan con el API.
  if (!['transaction.id', 'transaction.status', 'transaction.amount_in_cents'].every((campo) => evento.signature.properties.includes(campo))) return false
  const esperado = createHash('sha256').update(`${valores}${evento.timestamp}${secreto}`).digest()
  return timingSafeEqual(esperado, Buffer.from(evento.signature.checksum, 'hex'))
}
export function urlCheckout(referencia: string, centavos: number, publica: string, secreto: string, retorno: string, expiracion: string): string {
  const url = new URL('https://checkout.wompi.co/p/')
  url.search = new URLSearchParams({ 'public-key': publica, currency: 'COP', 'amount-in-cents': String(centavos), reference: referencia, 'signature:integrity': firmaCheckout(referencia, centavos, secreto, expiracion), 'redirect-url': retorno, 'expiration-time': expiracion }).toString()
  return url.href
}