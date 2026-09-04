import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'

/**
 * Lo que un componente de servidor necesita saber de la sesion para decidir
 * que enseñar. Deliberadamente no expone el objeto `user` de Supabase: quien
 * pinta la interfaz no tiene por que ver el correo ni los metadatos.
 */
export interface Sesion {
  /** Validado contra el servidor de auth, no leido de la cookie. */
  readonly hayUsuario: boolean
  /** El access token, del que sale el rol. null si no hay sesion. */
  readonly accessToken: string | null
}

export const SIN_SESION: Sesion = { hayUsuario: false, accessToken: null }

/**
 * Unica lectura de la sesion del lado del servidor. La usan la cabecera y la
 * landing: si cada una la resolviera a su manera, acabarian discrepando.
 *
 * Mismo par de llamadas que src/middleware.ts, y por el mismo motivo:
 *   - getUser() revalida contra el servidor de auth. Es lo que decide si hay
 *     sesion; getSession() sola se limita a leer la cookie, que el navegador
 *     controla.
 *   - getSession() aporta el access token, que es de donde sale el rol
 *     (src/lib/auth/roles.ts). El objeto `user` no trae el claim del hook.
 *
 * El orden importa: sin usuario validado no se mira el token para nada.
 */
export async function sesionActual(): Promise<Sesion> {
  const supabase = await crearClienteServidor()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return SIN_SESION

  const { data: { session } } = await supabase.auth.getSession()
  return { hayUsuario: true, accessToken: session?.access_token ?? null }
}
