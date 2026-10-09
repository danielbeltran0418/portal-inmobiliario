/**
 * Marca de "esta sesion se abrio con un enlace de recuperacion".
 *
 * El enlace del correo abre una sesion normal de Supabase; sin esta marca,
 * /restablecer dejaria cambiar la contrasena a cualquier sesion abierta, sin
 * pedir la actual. La pone /confirmar/recuperacion (httpOnly, 15 minutos) con
 * el id del usuario que verifico el enlace, y la consume la accion de
 * /restablecer al cambiar la clave.
 */
export const COOKIE_RECUPERACION = 'recuperacion_pendiente'

export const DURACION_RECUPERACION_SEGUNDOS = 15 * 60

export const MENSAJE_ENLACE_RECUPERACION =
  'El enlace de recuperación caducó o ya se usó. Pide uno nuevo para cambiar tu contraseña.'

/**
 * La misma respuesta exista o no la cuenta, y tambien con la ventana agotada:
 * cualquier diferencia diria que correos estan registrados. Vive aqui y no en
 * recuperar/acciones.ts porque un modulo 'use server' solo exporta funciones.
 */
export const MENSAJE_RECUPERACION_ENVIADA =
  'Si ese correo tiene una cuenta, te enviamos un enlace para crear una contraseña nueva. ' +
  'Revisa tu bandeja de entrada (y la de spam); el enlace caduca en una hora.'

/**
 * Metodos `amr` que deja en el token un enlace de recuperacion, comprobados
 * contra supabase/auth (internal/api/verify.go): verifyOtp con token_hash --
 * lo que hace /confirmar/recuperacion -- emite la sesion con 'otp', y el
 * intercambio PKCE de un flujo de recuperacion con 'recovery'.
 */
const METODOS_DE_RECUPERACION = new Set(['otp', 'recovery'])

/**
 * `true` si el token VERIFICADO (claims de getClaims) prueba que la sesion se
 * abrio con un enlace del correo en los ultimos DURACION_RECUPERACION_SEGUNDOS.
 *
 * La cookie COOKIE_RECUPERACION sola no basta: su valor es el id del usuario,
 * que cualquiera con la sesion abierta conoce (va en el `sub` del token) y
 * puede escribir en su navegador. Con eso, una sesion robada o un equipo
 * compartido bastaban para cambiar la contrasena sin pasar por el correo.
 * El `amr` va firmado dentro del JWT y no se puede fabricar.
 */
export function sesionDeRecuperacionReciente(
  claims: { amr?: unknown } | null | undefined,
  ahoraSegundos: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!Array.isArray(claims?.amr)) return false
  return claims.amr.some((entrada: unknown) => {
    const { method, timestamp } = (entrada ?? {}) as { method?: unknown; timestamp?: unknown }
    return typeof method === 'string'
      && METODOS_DE_RECUPERACION.has(method)
      && typeof timestamp === 'number'
      && timestamp <= ahoraSegundos + 60
      && ahoraSegundos - timestamp <= DURACION_RECUPERACION_SEGUNDOS
  })
}
