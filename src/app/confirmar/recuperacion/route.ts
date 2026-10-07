import { type NextRequest, NextResponse } from 'next/server'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { origenReal } from '@/lib/http/origen-peticion'
import { COOKIE_RECUPERACION, DURACION_RECUPERACION_SEGUNDOS } from '@/lib/auth/recuperacion'

/**
 * Destino del enlace de "¿Olvidaste tu contraseña?". Igual que /confirmar,
 * acepta las dos formas del enlace: `?token_hash=...&type=recovery` (plantilla
 * propia de supabase/templates/recuperacion.html, solo en local) y `?code=...`
 * (plantilla por defecto del proyecto alojado, canje PKCE contra el verificador
 * que dejo en cookie resetPasswordForEmail).
 *
 * Es una ruta aparte y no un `type` mas de /confirmar a proposito: alli un
 * token de recuperacion lleva al panel como si fuera una verificacion de
 * correo, y aqui tiene que terminar en /restablecer con la marca puesta.
 */
export async function GET(peticion: NextRequest) {
  const origin = origenReal(peticion)
  const { searchParams } = new URL(peticion.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const code = searchParams.get('code')

  const supabase = await crearClienteServidor()

  let idUsuario: string | null = null
  if (token_hash && type === 'recovery') {
    const { data, error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash })
    if (!error && data.session) idUsuario = data.user?.id ?? null
  } else if (code && !token_hash) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.session) idUsuario = data.user?.id ?? null
  }

  if (!idUsuario) {
    return NextResponse.redirect(`${origin}/recuperar?enlace=invalido`)
  }

  const respuesta = NextResponse.redirect(`${origin}/restablecer`)
  respuesta.cookies.set(COOKIE_RECUPERACION, idUsuario, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DURACION_RECUPERACION_SEGUNDOS,
  })
  return respuesta
}
