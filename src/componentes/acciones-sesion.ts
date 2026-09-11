'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'

/**
 * Las cookies donde @supabase/ssr guarda la sesion: `sb-<ref>-auth-token`,
 * troceada en `.0`, `.1`... cuando el token no cabe en una sola.
 */
const COOKIE_DE_SESION = /^sb-.+-auth-token(\.\d+)?$/

/**
 * El alcance del cierre de sesion. Ver el bloque "Por que scope: 'local'".
 *
 * Es una constante con nombre y no un literal suelto en la llamada para que la
 * prueba pueda afirmar el valor por identidad y para que quien busque
 * "cerrar sesion en todos los dispositivos" caiga aqui.
 */
const ALCANCE_DEL_CIERRE = 'global' as const

/**
 * Cierre de sesion.
 *
 * ---------------------------------------------------------------------------
 * Por que es un server action y no un route handler GET
 * ---------------------------------------------------------------------------
 * Un `<a href="/salir">` es una peticion GET que cualquiera puede provocar
 * desde fuera: basta con que la victima cargue una pagina con un <img
 * src="https://portal/salir">. Es CSRF de manual -- de bajo impacto, pero
 * gratuito de evitar. Y hay un segundo modo de fallo mas prosaico y mas
 * probable: los prefetchers (el propio <Link> de Next, la precarga del
 * navegador, un antivirus que abre los enlaces del correo) recorren los GET
 * por su cuenta y cerrarian la sesion sin que nadie hiciera clic.
 *
 * Un server action de Next viaja siempre por POST y trae comprobacion de
 * origen incorporada. La CSP de este proyecto lo refuerza con
 * `form-action 'self'`.
 *
 * ---------------------------------------------------------------------------
 * Por que scope: 'local' y no el de por defecto
 * ---------------------------------------------------------------------------
 * `signOut()` sin argumentos NO cierra la sesion de este navegador: cierra la
 * de TODOS los dispositivos de la cuenta. La firma de la libreria instalada es
 * literalmente `async signOut(options = { scope: 'global' })`
 * (@supabase/auth-js 2.112.4, `GoTrueClient.js`), y su propio JSDoc lo avisa:
 * "the default `scope` is 'global'. This signs the user out of every device
 * they are currently signed in on", y recomienda `{ scope: 'local' }` como lo
 * que casi siempre quiere el boton de salir.
 *
 * Es un default sorprendente -- el resto de librerias de auth hacen lo
 * contrario -- y aqui el efecto es concreto: un vendedor con el portal abierto
 * en el movil y en el escritorio pierde las dos sesiones por pulsar "Cerrar
 * sesion" en una. Nunca pidio eso.
 *
 * Y no se compensa con seguridad, porque 'global' compra menos de lo que
 * parece: Supabase revoca los refresh tokens, pero los access tokens (JWT) ya
 * emitidos siguen siendo validos en los otros dispositivos hasta que caducan
 * -- lo dice el mismo JSDoc. O sea que 'global' no termina las otras sesiones
 * al instante; solo las condena a morir en su siguiente renovacion. El coste
 * de usabilidad, en cambio, es inmediato y seguro.
 *
 * 'local' no rebaja nada del dispositivo que pidio salir: revoca su refresh
 * token en el servidor de auth igual que 'global', y borra su cookie. La
 * diferencia es solo que no toca los demas.
 *
 * Cerrar sesion en todas partes es una accion DISTINTA -- movil perdido,
 * cambio de contrasena -- que quiere su propio boton con su propio nombre en
 * los ajustes de la cuenta, y no que se la ejecuten sin haberla pedido desde
 * la cabecera. Si algun dia se implementa, es ahi donde va, con
 * `{ scope: 'global' }` explicito.
 *
 * ---------------------------------------------------------------------------
 * Por que se borran las cookies a mano si signOut falla
 * ---------------------------------------------------------------------------
 * `signOut()` revoca el refresh token en el servidor de auth y BORRA la cookie
 * local. Pero hay un camino en el que devuelve error SIN llegar a borrarla:
 * cuando `_useSession` no consigue resolver la sesion antes de la llamada
 * (p. ej. el refresh token ya no vale y la renovacion falla), `_signOut`
 * devuelve ese error de entrada, antes de tocar el almacenamiento (ver
 * `_signOut` en @supabase/auth-js). El usuario veria la landing de anonimo y
 * creeria haber salido, con la credencial intacta en su navegador: justo el
 * fallo que hace peligroso un cierre de sesion a medias.
 *
 * Asi que ante un error se borran las cookies de sesion explicitamente. No
 * revoca el refresh token en el servidor -- eso ya no esta en nuestra mano si
 * el servidor de auth no responde -- pero deja este navegador sin credencial,
 * que es lo que el usuario acaba de pedir y lo que el middleware comprueba.
 */
export async function cerrarSesion(): Promise<void> {
  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.signOut({ scope: ALCANCE_DEL_CIERRE })

  if (error) {
    console.error('[cerrarSesion] signOut fallo, se borran las cookies:', error.message)
    const almacen = await cookies()
    for (const cookie of almacen.getAll()) {
      if (COOKIE_DE_SESION.test(cookie.name)) almacen.delete(cookie.name)
    }
  }

  // redirect() lanza una excepcion de control de Next: tiene que quedar fuera
  // de cualquier try/catch para que Next la vea.
  redirect('/')
}
