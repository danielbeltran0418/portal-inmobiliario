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
 * Por que se borran las cookies a mano si signOut falla
 * ---------------------------------------------------------------------------
 * `signOut()` revoca el refresh token en el servidor de auth y BORRA la cookie
 * local. Pero si la llamada al servidor de auth falla con un error que no sea
 * 404/401/403, supabase-js devuelve el error y NO llega a borrar la cookie
 * (ver `_signOut` en @supabase/auth-js). El usuario veria la landing de
 * anonimo y creeria haber salido, con la sesion intacta en su navegador: justo
 * el fallo que hace peligroso un cierre de sesion a medias.
 *
 * Asi que ante un error se borran las cookies de sesion explicitamente. No
 * revoca el refresh token en el servidor -- eso ya no esta en nuestra mano si
 * el servidor de auth no responde -- pero deja este navegador sin credencial,
 * que es lo que el usuario acaba de pedir y lo que el middleware comprueba.
 */
export async function cerrarSesion(): Promise<void> {
  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.signOut()

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
