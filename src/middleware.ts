import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { construirCabeceras, generarNonce } from '@/lib/seguridad/cabeceras'
import { rolDesdeToken, rutaPermitida, rutaDePanel } from '@/lib/auth/roles'
import { origenReal } from '@/lib/http/origen-peticion'

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

          // Re-derivar las cabeceras DESPUES de mutar las cookies. peticion.cookies.set
          // reescribe la cabecera Cookie de la peticion, y reutilizar aqui el snapshot
          // tomado antes de getUser() la dejaria vieja: en la peticion donde Supabase
          // refresca el token, el navegador recibiria la cookie nueva pero los Server
          // Components de ESA misma peticion seguirian leyendo la anterior.
          const cabecerasRefrescadas = new Headers(peticion.headers)
          cabecerasRefrescadas.set('x-nonce', nonce)

          respuesta = NextResponse.next({ request: { headers: cabecerasRefrescadas } })
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
    // origenReal(peticion), no peticion.url: en next dev el host queda
    // canonicalizado a localhost y el salto perderia la cookie de sesion
    // fijada en el host real (127.0.0.1, el que usa site_url en local).
    const redireccion = NextResponse.redirect(new URL(destino, origenReal(peticion)))
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
