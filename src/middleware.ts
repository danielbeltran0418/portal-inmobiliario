import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { construirCabeceras, generarNonce } from '@/lib/seguridad/cabeceras'
import { rolDesdeToken, rutaPermitida, rutaDePanel } from '@/lib/auth/roles'

const RUTAS_PROTEGIDAS = ['/mi-cuenta', '/panel', '/control']

export async function middleware(peticion: NextRequest) {
  const nonce = generarNonce()
  let respuesta = NextResponse.next({ request: peticion })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => peticion.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value } of cookies) peticion.cookies.set(name, value)
          respuesta = NextResponse.next({ request: peticion })
          for (const { name, value, options } of cookies) {
            respuesta.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              // Lax y no Strict: con Strict, el usuario que llega desde el
              // enlace de verificacion del correo aterriza sin sesion.
              sameSite: 'lax',
              path: '/',
            })
          }
        },
      },
    },
  )

  // getUser revalida contra el servidor de auth; getSession solo lee la cookie.
  const { data: { user } } = await supabase.auth.getUser()
  const ruta = peticion.nextUrl.pathname
  const esProtegida = RUTAS_PROTEGIDAS.some((p) => ruta === p || ruta.startsWith(`${p}/`))

  if (esProtegida) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', peticion.url))
    }
    if (!user.email_confirmed_at) {
      return NextResponse.redirect(new URL('/verificar-correo', peticion.url))
    }

    const { data: { session } } = await supabase.auth.getSession()
    const rol = rolDesdeToken(session?.access_token ?? '')

    if (!rutaPermitida(ruta, rol)) {
      return NextResponse.redirect(new URL(rutaDePanel(rol), peticion.url))
    }
  }

  respuesta.headers.set('x-nonce', nonce)
  for (const [clave, valor] of Object.entries(construirCabeceras(nonce))) {
    respuesta.headers.set(clave, valor)
  }

  return respuesta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
}
