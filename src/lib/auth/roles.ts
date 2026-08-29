export type Rol = 'comprador' | 'vendedor' | 'super_admin'

const ROLES_VALIDOS: readonly Rol[] = ['comprador', 'vendedor', 'super_admin']

/** Prefijos protegidos y el rol que los habilita. */
const RUTAS_PROTEGIDAS: ReadonlyArray<{ prefijo: string; rol: Rol }> = [
  { prefijo: '/mi-cuenta', rol: 'comprador' },
  { prefijo: '/panel', rol: 'vendedor' },
  { prefijo: '/control', rol: 'super_admin' },
]

/**
 * Lee el rol del access token sin verificar la firma: Supabase ya la valido
 * al emitirlo, y RLS vuelve a comprobar el rol del lado de la base de datos.
 * Ante cualquier duda cae en el rol de menos privilegio.
 */
/**
 * Decodifica base64url sin Buffer: este modulo lo importa el middleware, que
 * corre en el runtime Edge. atob y TextDecoder si estan disponibles alli.
 * TextDecoder es necesario porque un nombre con tilde en los claims saldria
 * corrupto si se leyera el resultado de atob como texto directamente.
 */
export function decodificarBase64Url(valor: string): string {
  const base64 = valor.replace(/-/g, '+').replace(/_/g, '/')
  const relleno = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binario = atob(relleno)
  const bytes = Uint8Array.from(binario, (caracter) => caracter.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function rolDesdeToken(accessToken: string): Rol {
  try {
    const cuerpo = accessToken.split('.')[1]
    if (!cuerpo) return 'comprador'
    const claims = JSON.parse(decodificarBase64Url(cuerpo)) as {
      app_metadata?: { rol?: string }
    }
    const rol = claims.app_metadata?.rol
    return ROLES_VALIDOS.includes(rol as Rol) ? (rol as Rol) : 'comprador'
  } catch {
    return 'comprador'
  }
}

export function rutaPermitida(ruta: string, rol: Rol): boolean {
  const protegida = RUTAS_PROTEGIDAS.find(
    (r) => ruta === r.prefijo || ruta.startsWith(`${r.prefijo}/`),
  )
  if (!protegida) return true
  if (rol === 'super_admin') return true
  return protegida.rol === rol
}

export function rutaDePanel(rol: Rol): string {
  return RUTAS_PROTEGIDAS.find((r) => r.rol === rol)!.prefijo
}
