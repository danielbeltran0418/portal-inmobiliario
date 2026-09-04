import { headers } from 'next/headers'
import { claveDeSitioTurnstile } from '@/lib/seguridad/turnstile'

/**
 * Carga el script de Turnstile, o nada si el captcha no esta configurado.
 *
 * ---------------------------------------------------------------------------
 * El nonce, y por que la CSP no hay que tocarla
 * ---------------------------------------------------------------------------
 * La politica lleva 'strict-dynamic', y eso hace que el navegador IGNORE la
 * lista de origenes de script-src ('self' incluido). Anadir
 * challenges.cloudflare.com a script-src no habria servido de nada: bajo
 * 'strict-dynamic' un script externo se autoriza por nonce, y los que ese
 * script cargue despues heredan su confianza. De ahi que aqui se lea `x-nonce`
 * -- la cabecera que el middleware inyecta en la peticion -- en vez de abrir la
 * politica.
 *
 * Las otras dos directivas que Turnstile necesita ya estaban en
 * src/lib/seguridad/cabeceras.ts antes de este cambio: `frame-src` para el
 * iframe del desafio y `connect-src` para sus peticiones. Este componente NO
 * relaja la CSP en ningun punto.
 *
 * `async defer` es el fragmento que documenta Cloudflare. React 19 iza a <head>
 * los <script> con `async` conservando sus atributos, el nonce entre ellos.
 */
export async function GuionTurnstile() {
  if (!claveDeSitioTurnstile()) return null

  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <script
      src="https://challenges.cloudflare.com/turnstile/v0/api.js"
      nonce={nonce}
      async
      defer
    />
  )
}
