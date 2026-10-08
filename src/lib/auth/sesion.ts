import { cache } from 'react'
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
  /**
   * El id del usuario, ya validado por getUser(). null si no hay sesion.
   *
   * Se resuelve UNA sola vez, aqui: quien necesite comparar identidad (por
   * ejemplo, si el visitante de una ficha es su propio vendedor) lee este
   * campo en vez de decodificar el token por su cuenta. Derivar el id en dos
   * sitios distintos es como acaban comportandose distinto.
   */
  readonly idUsuario: string | null
}

export const SIN_SESION: Sesion = { hayUsuario: false, accessToken: null, idUsuario: null }

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
 *
 * cache() de React memoiza por peticion: la cabecera del layout y la pagina
 * la piden a la vez y antes cada una pagaba su propio viaje a auth. No
 * prerenderiza nada, asi que no choca con la regla de render dinamico del CI.
 */
export const sesionActual = cache(async (): Promise<Sesion> => {
  const supabase = await crearClienteServidor()

  // getClaims() verifica la firma del token. Con llaves de firma asimetricas
  // (Supabase > Auth > JWT Signing Keys) lo hace localmente contra el JWKS en
  // cache, SIN viaje al servidor de auth; con el secreto simetrico (HS256)
  // hace por dentro lo mismo que getUser(). Nunca es menos seguro que antes.
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return SIN_SESION

  // getSession() solo lee la cookie: el token que devuelve es el mismo que
  // getClaims() acaba de verificar.
  const { data: { session } } = await supabase.auth.getSession()
  return { hayUsuario: true, accessToken: session?.access_token ?? null, idUsuario: claims.sub }
})
