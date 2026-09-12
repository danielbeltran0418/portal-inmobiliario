import { randomUUID } from 'node:crypto'

export const MENSAJE_GENERICO =
  'No pudimos completar la operacion. Intenta de nuevo en un momento.'

export const MENSAJE_CREDENCIALES = 'Correo o contrasena incorrectos.'

/**
 * Captcha no superado. Es el unico mensaje del formulario que pide una accion
 * concreta al usuario, y a proposito: si dijera lo mismo que MENSAJE_GENERICO,
 * quien tiene el token caducado no sabria que lo que le falta es rehacer el
 * desafio. No dice por que fallo -- token ausente, repetido, o siteverify
 * caido: eso solo le serviria a quien esta probando como saltarselo.
 */
export const MENSAJE_CAPTCHA =
  'No pudimos verificar que eres una persona. Vuelve a intentarlo.'

export const MENSAJE_REGISTRO_BLOQUEADO =
  'Se han creado demasiadas cuentas desde esta conexion. Intenta de nuevo en una hora.'

/**
 * Sin IP de confianza el registro se rechaza, y el mensaje dice que es de
 * configuracion y no del usuario: quien lo lea no puede hacer nada por su
 * cuenta, y quien opere el despliegue tiene que enterarse. La alternativa era
 * dejar pasar el alta sin limite, que es el agujero silencioso que
 * src/lib/http/ip-cliente.ts existe para evitar.
 */
export const MENSAJE_SIN_IP_CONFIABLE =
  'El registro no esta disponible en este momento por un problema de configuracion del servidor.'

export const MENSAJE_SIN_FOTOS =
  'Para publicar necesitas subir al menos una foto de la propiedad.'

export const MENSAJE_SIN_PRECIO =
  'Para publicar necesitas fijar un precio para la propiedad.'

/**
 * Red de seguridad para 23514 (check_violation) cuando NINGUNA de las dos
 * causas conocidas puede identificarse por el codigo solo.
 *
 * Hay DOS triggers que lanzan 23514 sobre `propiedades` -- propiedades_exigir_imagen
 * (20260904000300) y propiedades_exigir_precio (20260907000100) -- y ambos lo
 * hacen con el mismo ERRCODE. Postgres no da forma de distinguirlos desde el
 * codigo de error solo, y la regla de este modulo prohibe mirar el texto del
 * error para decidir el mensaje. La via elegida es evitar la ambiguedad ANTES
 * de llegar aqui: cambiarEstado() (acciones.ts) comprueba ambos requisitos
 * contra la fila real y devuelve MENSAJE_SIN_FOTOS o MENSAJE_SIN_PRECIO segun
 * corresponda, sin pasar por mapearError. Este mensaje combinado solo se
 * alcanza en el hueco entre esa comprobacion y el UPDATE (otra pestaña borra
 * la ultima foto o vacia el precio a mitad de la carrera) o si algun camino
 * futuro llega a 'publicada' sin pasar por cambiarEstado. Sin saber cual de
 * los dos disparo, el mensaje cubre ambos en vez de adivinar uno.
 */
export const MENSAJE_REQUISITOS_PUBLICACION =
  'Para publicar, la propiedad necesita al menos una foto y un precio.'

const CODIGOS_DE_CREDENCIALES = new Set([
  'invalid_credentials',
  'user_not_found',
  'invalid_grant',
])

export interface ErrorPresentable {
  mensaje: string
  idCorrelacion: string
}

/**
 * Traduce cualquier error interno a un mensaje seguro.
 * El detalle completo se registra aparte, en registro_auditoria.
 *
 * Regla: el mensaje devuelto NUNCA se construye a partir del error original.
 */
export function mapearError(error: unknown): ErrorPresentable {
  const idCorrelacion = randomUUID()
  const codigo =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''

  if (CODIGOS_DE_CREDENCIALES.has(codigo)) {
    return { mensaje: MENSAJE_CREDENCIALES, idCorrelacion }
  }

  // 23514 = check_violation. Dos triggers de `propiedades` lo lanzan (ver el
  // comentario de MENSAJE_REQUISITOS_PUBLICACION arriba): esta rama es una
  // red de seguridad, no el camino normal. cambiarEstado() distingue las dos
  // causas ANTES de intentar el UPDATE y no depende de este mapeo para eso.
  if (codigo === '23514') {
    return { mensaje: MENSAJE_REQUISITOS_PUBLICACION, idCorrelacion }
  }

  return { mensaje: MENSAJE_GENERICO, idCorrelacion }
}
