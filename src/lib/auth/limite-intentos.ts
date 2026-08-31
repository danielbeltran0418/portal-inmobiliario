import 'server-only'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'

/**
 * Registro de fallos del limitador.
 *
 * No se incluye el correo: estos mensajes acaban en los logs del servidor, y un
 * log de operacion no es sitio para ir acumulando que cuentas intentan entrar.
 * Con la operacion y el error de Postgres sobra para diagnosticar -- un 42501,
 * por ejemplo, dice que se rompieron los privilegios de la funcion.
 */
function registrarFallo(operacion: string, error: unknown): void {
  console.error(
    `[limite-intentos] fallo el RPC ${operacion}: el limite de intentos queda ` +
    `degradado y se deniega por precaucion.`,
    error,
  )
}

export async function loginBloqueado(correo: string, ip: string): Promise<boolean> {
  const { data, error } = await crearClienteAdmin()
    .rpc('login_bloqueado', { p_correo: correo, p_ip: ip })

  // Ante un fallo de infraestructura se falla cerrado: bloquear es mas seguro
  // que dejar pasar intentos ilimitados.
  if (error) {
    registrarFallo('login_bloqueado', error)
    return true
  }
  return data === true
}

/**
 * Devuelve `true` si el intento quedo registrado, `false` si no.
 *
 * Antes devolvia void e ignoraba el error del RPC. Con los privilegios de la
 * funcion ya cerrados (migracion 20260831000100) eso pesa mas: si la llamada
 * empieza a fallar, los intentos fallidos dejan de contarse y el limite se
 * apaga EN SILENCIO. Nadie se entera hasta que alguien mira los intentos de
 * una cuenta ya comprometida.
 *
 * La decision de que hacer con el `false` es de quien llama, porque las dos
 * llamadas no significan lo mismo: ver iniciarSesion en
 * src/app/(auth)/login/acciones.ts.
 */
export async function registrarIntentoLogin(
  correo: string, ip: string, exitoso: boolean,
): Promise<boolean> {
  const { error } = await crearClienteAdmin()
    .rpc('registrar_intento_login', { p_correo: correo, p_ip: ip, p_exitoso: exitoso })

  if (error) {
    registrarFallo('registrar_intento_login', error)
    return false
  }
  return true
}
