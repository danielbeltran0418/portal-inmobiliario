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

  return { mensaje: MENSAJE_GENERICO, idCorrelacion }
}
