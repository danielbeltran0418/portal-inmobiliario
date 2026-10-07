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
