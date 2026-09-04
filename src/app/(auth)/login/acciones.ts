'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { esquemaLogin } from '@/lib/validacion/esquemas'
import { mapearError, MENSAJE_CAPTCHA, MENSAJE_CREDENCIALES } from '@/lib/errores/mapear'
import { loginBloqueado, registrarIntentoLogin } from '@/lib/auth/limite-intentos'
import { rolDesdeToken, rutaDePanel } from '@/lib/auth/roles'
import { ipDeConfianza } from '@/lib/http/ip-cliente'
import { CAMPO_TURNSTILE, verificarTurnstile } from '@/lib/seguridad/turnstile'

export interface EstadoFormulario {
  error?: string
}

const MENSAJE_BLOQUEADO =
  'Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentar.'

export async function iniciarSesion(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaLogin.safeParse({
    correo: formData.get('correo'),
    password: formData.get('password'),
  })
  if (!analisis.success) return { error: MENSAJE_CREDENCIALES }

  const { correo, password } = analisis.data

  // null cuando no hay una IP en la que confiar. No es "sin limite": para el
  // limitador significa "ventana por correo, sin discriminar IP", que es mas
  // estricto y no falsificable. Ver src/lib/http/ip-cliente.ts y la migracion
  // 20260831000500.
  const ip = ipDeConfianza(await headers())

  if (await loginBloqueado(correo, ip)) {
    return { error: MENSAJE_BLOQUEADO }
  }

  /**
   * Captcha (hallazgo I4). Va DESPUES del limitador y ANTES de Supabase, y las
   * dos posiciones son deliberadas:
   *
   * - Despues del limitador: a una cuenta ya bloqueada se le responde sin
   *   gastar una peticion a Cloudflare por cada intento.
   * - Antes de signInWithPassword: el captcha existe para frenar al bot antes
   *   de que consuma nada, no para comentar el resultado.
   *
   * Y un captcha fallido NO se contabiliza como intento fallido de login.
   * Contarlo abriria una forma trivial de bloquear la cuenta de cualquiera:
   * cinco envios con el captcha en blanco y la victima se queda fuera 15
   * minutos sin que nadie haya tocado su contrasena.
   *
   * Con TURNSTILE_SITE_KEY y TURNSTILE_SECRET_KEY sin definir, verificarTurnstile
   * devuelve true sin mirar nada y este bloque no cambia el comportamiento.
   */
  if (!(await verificarTurnstile(formData.get(CAMPO_TURNSTILE), ip))) {
    return { error: MENSAJE_CAPTCHA }
  }

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password })

  if (error || !data.session) {
    const quedoRegistrado = await registrarIntentoLogin(correo, ip, false)

    // Si el fallo NO se pudo contabilizar, el limitador esta ciego: los
    // intentos no se acumulan y el sexto no se rechazaria nunca. Se degrada
    // hacia el lado seguro y se responde como si ya estuviera bloqueado. Al
    // atacante no le da informacion nueva -- el mensaje es el mismo para
    // cualquier correo, exista la cuenta o no -- y al usuario legitimo solo le
    // cuesta una espera mientras la infraestructura este rota.
    if (!quedoRegistrado) {
      return { error: MENSAJE_BLOQUEADO }
    }

    // El mismo mensaje para credenciales malas y usuario inexistente:
    // distinguirlos permitiria enumerar que correos tienen cuenta.
    return { error: error ? mapearError(error).mensaje : MENSAJE_CREDENCIALES }
  }

  // Aqui las credenciales YA son correctas. Si no se puede registrar el exito,
  // lo unico que se pierde es el limpiado de la ventana de fallos previos: el
  // usuario podria toparse con el bloqueo antes de tiempo mas adelante. Eso es
  // conservador, y es el lado correcto en el que fallar. Denegar a quien acaba
  // de demostrar su contrasena seria una negacion de servicio autoinfligida sin
  // ninguna ganancia de seguridad. El error ya queda en el log del servidor.
  await registrarIntentoLogin(correo, ip, true)
  redirect(rutaDePanel(rolDesdeToken(data.session.access_token)))
}
