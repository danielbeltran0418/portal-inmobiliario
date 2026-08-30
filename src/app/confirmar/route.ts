import { type NextRequest, NextResponse } from 'next/server'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { rolDesdeToken, rutaDePanel } from '@/lib/auth/roles'
import { origenReal } from '@/lib/http/origen-peticion'

export async function GET(peticion: NextRequest) {
  // origenReal(), no peticion.url: en next dev el host queda canonicalizado
  // a localhost y el salto perderia la cookie de sesion fijada en 127.0.0.1.
  const origin = origenReal(peticion)
  const { searchParams } = new URL(peticion.url)
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
