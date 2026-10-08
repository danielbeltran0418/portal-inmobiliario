import 'server-only'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { sesionConSegundoFactor } from '@/lib/auth/roles'

type ClienteServidor = Awaited<ReturnType<typeof crearClienteServidor>>

/**
 * Resultado de comprobar si quien llama puede usar el panel de control.
 *
 * - `sin_sesion`: no hay usuario o el token no se pudo verificar.
 * - `no_admin`:   hay usuario, pero su rol en `perfiles` no es super_admin.
 * - `falta_mfa`:  es super_admin, pero esta sesion no paso el segundo factor.
 * - `ok`:         super_admin con sesion aal2.
 */
export type AccesoAdmin =
  | { estado: 'sin_sesion' }
  | { estado: 'no_admin' }
  | { estado: 'falta_mfa'; cliente: ClienteServidor; adminId: string }
  | { estado: 'ok'; cliente: ClienteServidor; adminId: string }

/**
 * Unica comprobacion de acceso de administracion del lado del servidor. La
 * usan el layout de /control, sus server actions y sus rutas.
 *
 * - El rol se lee de `perfiles` en cada llamada, no del token (hallazgo L1):
 *   un super_admin degradado conservaba el rol del JWT hasta que caducara, y
 *   las acciones que escriben con service_role (barrios) no pasan por RLS.
 * - `aal` sale de getClaims(), que verifica la firma (hallazgo M2). Es la
 *   misma condicion que exige es_super_admin() en la base
 *   (20261015000100_mfa_super_admin.sql).
 */
export async function accesoAdmin(): Promise<AccesoAdmin> {
  const cliente = await crearClienteServidor()
  const { data, error } = await cliente.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return { estado: 'sin_sesion' }

  // perfil_lectura_propia deja leer la fila propia con cualquier aal.
  const { data: perfil } = await cliente
    .from('perfiles').select('rol').eq('id', claims.sub).maybeSingle()
  if (perfil?.rol !== 'super_admin') return { estado: 'no_admin' }

  const adminId = claims.sub
  return sesionConSegundoFactor(claims)
    ? { estado: 'ok', cliente, adminId }
    : { estado: 'falta_mfa', cliente, adminId }
}
