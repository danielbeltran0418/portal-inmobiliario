import 'server-only'

/**
 * Turnstile de Cloudflare (hallazgo I4), tras bandera de entorno.
 *
 * ---------------------------------------------------------------------------
 * Por que hay una bandera
 * ---------------------------------------------------------------------------
 * El spec pide captcha en registro y login, pero Turnstile necesita una cuenta
 * de Cloudflare que este proyecto todavia no tiene. La alternativa era dejarlo
 * fuera de SP0; se implemento con bandera para que el dia que existan las
 * claves solo haya que ponerlas en el entorno, sin tocar codigo ni volver a
 * razonar la CSP.
 *
 * Activo = las DOS variables presentes y no vacias. Con una sola no se activa:
 * con solo la secreta no habria widget que produjera un token y TODO login y
 * TODO registro quedarian rechazados; con solo la publica se pintaria un
 * widget que nadie verifica, que es peor que no tenerlo porque aparenta una
 * proteccion inexistente. Media configuracion es un error de despliegue, y se
 * avisa por consola una vez -- mismo criterio que src/lib/http/ip-cliente.ts.
 *
 * ---------------------------------------------------------------------------
 * La verificacion es del SERVIDOR
 * ---------------------------------------------------------------------------
 * El widget del navegador no valida nada: solo produce un token. Quien decide
 * es siteverify, y se le llama desde el server action. Un captcha comprobado
 * unicamente en el cliente lo salta cualquiera con curl, que es exactamente el
 * atacante contra el que se pone.
 *
 * ---------------------------------------------------------------------------
 * Se falla CERRADO
 * ---------------------------------------------------------------------------
 * Si siteverify no responde, o responde algo que no se puede leer, la
 * verificacion devuelve false y el formulario se rechaza. La alternativa
 * -- dejar pasar cuando el verificador no contesta -- convierte una caida de
 * Cloudflare, o cualquier interferencia con esa peticion saliente, en un
 * interruptor para apagar el captcha. Es el mismo criterio que ya sigue
 * loginBloqueado en src/lib/auth/limite-intentos.ts.
 *
 * El coste esta asumido y es real: mientras Cloudflare este caido, nadie entra
 * ni se registra. Se acota con un tiempo limite corto para que la peticion no
 * quede colgada, y con la bandera, que permite apagar el captcha en el entorno
 * si hiciera falta.
 */

const URL_SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** El campo oculto que el widget inyecta en el formulario. Lo fija Cloudflare. */
export const CAMPO_TURNSTILE = 'cf-turnstile-response'

/**
 * Sin esto, una peticion a siteverify que no responda deja colgado el server
 * action -- y con el, la conexion del usuario. Cinco segundos son de sobra
 * para un servicio que normalmente responde en decenas de milisegundos.
 */
const TIEMPO_LIMITE_MS = 5000

let avisoEmitido = false

function avisarUnaVez(motivo: string): void {
  if (avisoEmitido) return
  avisoEmitido = true
  console.warn(`[turnstile] ${motivo}. El captcha queda DESACTIVADO.`)
}

function variables(): { sitio: string; secreta: string } | null {
  const sitio = process.env.TURNSTILE_SITE_KEY?.trim()
  const secreta = process.env.TURNSTILE_SECRET_KEY?.trim()

  if (sitio && secreta) return { sitio, secreta }

  if (sitio || secreta) {
    // Se nombra la que FALTA, no la que hay: es lo unico accionable para quien
    // lee el log.
    avisarUnaVez(
      `falta ${sitio ? 'TURNSTILE_SECRET_KEY' : 'TURNSTILE_SITE_KEY'} y se necesitan las dos`,
    )
  }
  return null
}

/**
 * Clave publica con la que se pinta el widget, o `null` si el captcha no esta
 * activo. La consume la pagina (componente de servidor) para decidir si
 * renderiza el widget: por eso NO lleva prefijo NEXT_PUBLIC_ -- la clave viaja
 * al navegador dentro del HTML ya renderizado, y asi la bandera se controla
 * entera desde el servidor.
 */
export function claveDeSitioTurnstile(): string | null {
  return variables()?.sitio ?? null
}

/**
 * `true` si el formulario puede seguir adelante.
 *
 * Con el captcha desactivado devuelve `true` sin mirar el token: es el
 * comportamiento de SP0 hasta que existan las claves.
 *
 * @param token lo que llego en el campo del formulario. Es entrada del cliente,
 *              asi que se trata como no fiable: si no es una cadena util, se
 *              rechaza sin gastar una llamada a Cloudflare.
 * @param ip    IP de confianza resuelta por src/lib/http/ip-cliente.ts, o null.
 *              Se envia como `remoteip` solo cuando existe: mandar una IP que
 *              venga de una cabecera del cliente seria devolverle a Cloudflare
 *              justo el dato falsificable que el hallazgo I3 quito de en medio.
 */
export async function verificarTurnstile(
  token: FormDataEntryValue | null,
  ip: string | null,
): Promise<boolean> {
  const configuracion = variables()
  if (!configuracion) return true

  if (typeof token !== 'string' || token.trim() === '') return false

  const cuerpo = new URLSearchParams({
    secret: configuracion.secreta,
    response: token,
  })
  if (ip) cuerpo.set('remoteip', ip)

  try {
    const respuesta = await fetch(URL_SITEVERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo,
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      cache: 'no-store',
    })

    if (!respuesta.ok) {
      console.error(`[turnstile] siteverify respondio ${respuesta.status}. Se rechaza.`)
      return false
    }

    const datos: unknown = await respuesta.json()
    // Comparacion estricta contra true: un cuerpo inesperado (una pagina de
    // error, un JSON sin el campo) no debe leerse como exito.
    return (datos as { success?: unknown })?.success === true
  } catch (error) {
    // No se registra el token: lo controla el cliente y acabaria en los logs.
    console.error('[turnstile] no se pudo verificar contra siteverify. Se rechaza.', error)
    return false
  }
}
