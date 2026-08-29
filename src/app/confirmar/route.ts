import { type NextRequest, NextResponse } from 'next/server'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { rolDesdeToken, rutaDePanel } from '@/lib/auth/roles'

export async function GET(peticion: NextRequest) {
  const { searchParams, origin } = new URL(peticion.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (!token_hash || type !== 'email') {
    return NextResponse.redirect(`${origin}/login?verificacion=fallida`)
  }

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.auth.verifyOtp({ type: 'email', token_hash })

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?verificacion=fallida`)
  }

  const rol = rolDesdeToken(data.session.access_token)
  return NextResponse.redirect(`${origin}${rutaDePanel(rol)}`)
}
