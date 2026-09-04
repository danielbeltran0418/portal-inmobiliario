import 'server-only'

/**
 * IP del cliente en la que se puede confiar para el limite de intentos.
 *
 * ---------------------------------------------------------------------------
 * El problema
 * ---------------------------------------------------------------------------
 * `x-forwarded-for` la manda el CLIENTE. Tomar su primera entrada -- que es lo
 * que hacia src/app/(auth)/login/acciones.ts -- deja el limite por IP en nada:
 *
 *   - rotando la cabecera en cada peticion, el atacante estrena bucket cada
 *     vez y nunca llega al quinto fallo;
 *   - fijandola a la IP de otra persona, gasta los intentos de esa victima y
 *     la bloquea.
 *
 * La cabecera solo significa algo si la escribio un proxy de confianza. Es el
 * mismo problema que resuelve origen-peticion.ts con Host, y se resuelve con
 * el mismo criterio: en produccion no se deriva nada de lo que manda el
 * cliente.
 *
 * ---------------------------------------------------------------------------
 * La politica
 * ---------------------------------------------------------------------------
 * 1. DESARROLLO (`NODE_ENV !== 'production'`): se devuelve 127.0.0.1 y no se
 *    lee ninguna cabecera. No hay proxy delante, asi que cualquier
 *    `x-forwarded-for` que llegue lo puso el cliente. Es ademas lo que hace
 *    que el limite sea observable en local.
 *
 * 2. PRODUCCION: se lee UNICAMENTE la cabecera cuyo nombre este en
 *    `IP_CABECERA_CONFIABLE`, y de ella su ULTIMA entrada.
 *
 *    - La ultima y no la primera: cada salto ANADE al final la direccion que
 *      vio. Si el cliente manda `1.2.3.4` y el proxy le anade la real, la
 *      cadena queda `1.2.3.4, 5.6.7.8`: la ultima entrada es la unica que no
 *      escribio el cliente.
 *    - Por nombre configurable y no `x-forwarded-for` fijo: la cabecera que
 *      sirve es la que la plataforma GARANTIZA reescribir, descartando lo que
 *      trajera la peticion. En Vercel es `x-vercel-forwarded-for`; en otro
 *      despliegue sera otra. Codificar `x-forwarded-for` aqui seria volver a
 *      confiar en una cabecera que cualquiera puede componer.
 *    - "Ultima entrada" supone exactamente UN salto de confianza. Con dos
 *      proxies encadenados la ultima entrada es la del proxy interior, no la
 *      del cliente. Ese despliegue no existe hoy; si aparece, esta constante
 *      es el sitio donde se arregla.
 *
 * 3. Si no se puede determinar una IP de confianza -- variable sin configurar,
 *    cabecera ausente, o valor que no es una IP -- se devuelve `null`, que
 *    para el limitador significa "ventana por correo, sin discriminar IP"
 *    (ver la migracion 20260831000500). Se degrada a un limite mas ESTRICTO y
 *    no falsificable, nunca a "sin limite".
 *
 * ---------------------------------------------------------------------------
 * Por que no hay valor por defecto para IP_CABECERA_CONFIABLE
 * ---------------------------------------------------------------------------
 * Porque adivinar mal el nombre de la cabecera no se nota: la aplicacion
 * funciona igual y el limite por IP queda apagado en silencio. Sin valor por
 * defecto, un despliegue sin configurar cae en el modo degradado -- que sigue
 * limitando, por correo -- y deja un aviso en el log.
 */

const CABECERA_CONFIGURADA = 'IP_CABECERA_CONFIABLE'
const IP_DE_DESARROLLO = '127.0.0.1'

let avisoEmitido = false

function avisarUnaVez(motivo: string): void {
  if (avisoEmitido) return
  avisoEmitido = true
  console.warn(
    `[ip-cliente] ${motivo}. El limite de intentos se aplica solo por correo, ` +
    `que es mas estricto y no falsificable, pero se pierde la discriminacion ` +
    `por IP. Configura ${CABECERA_CONFIGURADA} con el nombre de la cabecera ` +
    `que reescribe tu plataforma (en Vercel, x-vercel-forwarded-for).`,
  )
}

function esIpv4(valor: string): boolean {
  const octetos = valor.split('.')
  if (octetos.length !== 4) return false
  return octetos.every(
    (o) => /^\d{1,3}$/.test(o) && Number(o) <= 255 && (o === '0' || !o.startsWith('0')),
  )
}

/**
 * IPv6 en las formas que emite un proxy: grupos de 1 a 4 digitos hexadecimales,
 * como mucho una compresion `::`, y la variante con cola IPv4 (`::ffff:1.2.3.4`).
 *
 * Ser estricto de mas aqui no abre ningun agujero: una IPv6 legitima que se
 * rechazara cae en el modo degradado, que limita por correo. El error caro es
 * el contrario -- dejar pasar basura hasta la columna `inet`, donde el INSERT
 * revienta con 22P02 y el limitador acaba denegando por precaucion a usuarios
 * legitimos.
 */
function esIpv6(valor: string): boolean {
  if (!/^[0-9A-Fa-f:.]+$/.test(valor)) return false
  if (valor.split('::').length > 2) return false

  const [izquierda, derecha] = valor.includes('::') ? valor.split('::') : [valor, null]
  const grupos = [
    ...(izquierda ? izquierda.split(':') : []),
    ...(derecha ? derecha.split(':') : []),
  ]
  if (grupos.length === 0) return derecha !== null

  const cola = grupos[grupos.length - 1]
  const conColaIpv4 = cola.includes('.')
  if (conColaIpv4 && !esIpv4(cola)) return false

  const hexadecimales = conColaIpv4 ? grupos.slice(0, -1) : grupos
  if (!hexadecimales.every((g) => /^[0-9A-Fa-f]{1,4}$/.test(g))) return false

  // Una IPv4 empotrada ocupa dos grupos de 16 bits.
  const ocupados = hexadecimales.length + (conColaIpv4 ? 2 : 0)
  return derecha === null ? ocupados === 8 : ocupados < 8
}

/**
 * Quita el puerto y los corchetes que algunos proxies anaden, y valida.
 * Devuelve `null` si lo que queda no es una IP.
 */
function normalizar(entrada: string): string | null {
  let valor = entrada.trim()

  const entreCorchetes = valor.match(/^\[(.+)\](?::\d+)?$/)
  if (entreCorchetes) {
    valor = entreCorchetes[1]
  } else if ((valor.match(/:/g) ?? []).length === 1) {
    // Un solo ':' solo puede ser un puerto: una IPv6 sin corchetes lleva mas.
    valor = valor.slice(0, valor.indexOf(':'))
  }

  if (esIpv4(valor) || esIpv6(valor)) return valor
  return null
}

export function ipDeConfianza(cabeceras: Headers): string | null {
  if (process.env.NODE_ENV !== 'production') {
    return IP_DE_DESARROLLO
  }

  const nombre = process.env[CABECERA_CONFIGURADA]?.trim()
  if (!nombre) {
    avisarUnaVez(`${CABECERA_CONFIGURADA} no esta configurada`)
    return null
  }

  const cadena = cabeceras.get(nombre)
  if (!cadena) {
    avisarUnaVez(`la peticion no trae la cabecera "${nombre}"`)
    return null
  }

  const entradas = cadena.split(',').map((e) => e.trim()).filter(Boolean)
  const ultima = entradas[entradas.length - 1]
  if (!ultima) {
    avisarUnaVez(`la cabecera "${nombre}" llego vacia`)
    return null
  }

  const ip = normalizar(ultima)
  if (!ip) {
    // A proposito no se registra el valor recibido: lo controla el cliente y
    // acabaria en los logs del servidor tal cual.
    avisarUnaVez(`la ultima entrada de "${nombre}" no es una IP valida`)
    return null
  }

  return ip
}
