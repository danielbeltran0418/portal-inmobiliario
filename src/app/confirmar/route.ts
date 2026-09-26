import { type NextRequest, NextResponse } from 'next/server'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { rolDesdeToken, rutaDePanel } from '@/lib/auth/roles'
import { origenReal } from '@/lib/http/origen-peticion'

/**
 * El enlace del correo llega en una de dos formas, segun que plantilla use
 * el proyecto de Supabase:
 *
 * - `?token_hash=...&type=email`: la plantilla propia de
 *   supabase/templates/confirmacion.html. Solo la aplica el entorno LOCAL
 *   (config.toml); el proyecto alojado no la hereda.
 * - `?code=...`: la plantilla por defecto del proyecto alojado
 *   ({{ .ConfirmationURL }}). Supabase verifica el correo en su dominio y
 *   redirige aqui con un codigo PKCE, que se canjea contra el code_verifier
 *   que dejo en una cookie el signUp de registro/acciones.ts.
 *
 * Aceptar solo la primera dejaba a cualquier cuenta creada en produccion con
 * la plantilla por defecto sin poder entrar: el correo se verificaba en
 * Supabase pero aqui se rebotaba a /login?verificacion=fallida.
 */
const TIPOS_ACEPTADOS = new Set(['email', 'signup'])

export async function GET(peticion: NextRequest) {
  // origenReal(), no peticion.url: en next dev el host queda canonicalizado
  // a localhost y el salto perderia la cookie de sesion fijada en 127.0.0.1.
  const origin = origenReal(peticion)
  const { searchParams } = new URL(peticion.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const code = searchParams.get('code')

  const supabase = await crearClienteServidor()

  let accessToken: string | null = null
  if (token_hash && type && TIPOS_ACEPTADOS.has(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ type: 'email', token_hash })
    if (!error) accessToken = data.session?.access_token ?? null
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) accessToken = data.session?.access_token ?? null
  }

  if (!accessToken) {
    return NextResponse.redirect(`${origin}/login?verificacion=fallida`)
  }

  return NextResponse.redirect(`${origin}${rutaDePanel(rolDesdeToken(accessToken))}`)
}
