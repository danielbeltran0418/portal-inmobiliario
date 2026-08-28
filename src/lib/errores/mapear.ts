import { randomUUID } from 'node:crypto'

export const MENSAJE_GENERICO =
  'No pudimos completar la operacion. Intenta de nuevo en un momento.'

export const MENSAJE_CREDENCIALES = 'Correo o contrasena incorrectos.'

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
