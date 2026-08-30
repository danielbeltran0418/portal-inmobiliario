import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { construirCabeceras, generarNonce } from '@/lib/seguridad/cabeceras'
import { rolDesdeToken, rutaPermitida, rutaDePanel } from '@/lib/auth/roles'

const RUTAS_PROTEGIDAS = ['/mi-cuenta', '/panel', '/control']

export async function middleware(peticion: NextRequest) {
  const nonce = generarNonce()

  const cabecerasPeticion = new Headers(peticion.headers)
  cabecerasPeticion.set('x-nonce', nonce)

  let respuesta = NextResponse.next({ request: { headers: cabecerasPeticion } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => peticion.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value } of cookies) peticion.cookies.set(name, value)
          respuesta = NextResponse.next({ request: { headers: cabecerasPeticion } })
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

  function aplicarCabeceras(destino: NextResponse): NextResponse {
    destino.headers.set('x-nonce', nonce)
    for (const [clave, valor] of Object.entries(construirCabeceras(nonce))) {
      destino.headers.set(clave, valor)
    }
    return destino
  }

  function redirigir(destino: string): NextResponse {
    const redireccion = NextResponse.redirect(new URL(destino, peticion.url))
    for (const cookie of respuesta.cookies.getAll()) {
      redireccion.cookies.set(cookie)
    }
    return aplicarCabeceras(redireccion)
  }

  // getUser revalida contra el servidor de auth; getSession solo lee la cookie.
  const { data: { user } } = await supabase.auth.getUser()
  const ruta = peticion.nextUrl.pathname
  const esProtegida = RUTAS_PROTEGIDAS.some((p) => ruta === p || ruta.startsWith(`${p}/`))

  if (esProtegida) {
    if (!user) {
      return redirigir('/login')
    }
    if (!user.email_confirmed_at) {
      return redirigir('/verificar-correo')
    }

    const { data: { session } } = await supabase.auth.getSession()
    const rol = rolDesdeToken(session?.access_token ?? '')

    if (!rutaPermitida(ruta, rol)) {
      return redirigir(rutaDePanel(rol))
    }
  }

  return aplicarCabeceras(respuesta)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
}
