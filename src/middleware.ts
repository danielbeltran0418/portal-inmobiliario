import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { construirCabeceras, generarNonce } from '@/lib/seguridad/cabeceras'
import { rolDesdeToken, rutaPermitida, rutaDePanel } from '@/lib/auth/roles'
import { origenReal } from '@/lib/http/origen-peticion'

const RUTAS_PROTEGIDAS = ['/mi-cuenta', '/panel', '/control']

export async function middleware(peticion: NextRequest) {
  const nonce = generarNonce()
  const cabecerasSeguridad = construirCabeceras(nonce)
  const csp = cabecerasSeguridad['Content-Security-Policy']

  /**
   * Cabeceras que se le entregan a la aplicacion como si fueran las de la
   * peticion original.
   *
   * Next NO lee el nonce de x-nonce. Lo saca de la cabecera
   * Content-Security-Policy de la PETICION
   * (next/dist/server/app-render/app-render.js: `headers['content-security-policy']`),
   * y solo si la encuentra ahi se lo pone a los <script> que inyecta.
   * Ponerla aqui es el contrato documentado y el unico que no depende de un
   * detalle interno del servidor.
   *
   * Matiz comprobado en Next 16.3.3: el router de Node
   * (server/lib/router-utils/resolve-routes.js) copia TODA cabecera de la
   * respuesta del middleware tambien sobre req.headers, asi que en este
   * despliegue el nonce llegaria igual solo con la cabecera de respuesta. No
   * se confia en eso: es interno, no esta documentado y no vale para todos
   * los destinos de despliegue.
   *
   * Es una funcion y no un snapshot a proposito: la trampa que ya mordio dos
   * veces es que setAll muta peticion.cookies (y con ello la cabecera Cookie)
   * y reconstruye la respuesta. Reutilizar un Headers congelado ahi devolveria
   * la cookie vieja a los Server Components de esa misma peticion. Se vuelve a
   * leer peticion.headers en cada llamada.
   *
   * x-nonce se mantiene porque la suite e2e lo asserta y porque es como un
   * componente obtendria el nonce si algun dia necesita renderizar un script
   * inline propio. Hoy, en src/, no lo lee nadie.
   */
  function cabecerasDePeticion(): Headers {
    const cabeceras = new Headers(peticion.headers)
    cabeceras.set('x-nonce', nonce)
    cabeceras.set('content-security-policy', csp)
    return cabeceras
  }

  let respuesta = NextResponse.next({ request: { headers: cabecerasDePeticion() } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => peticion.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value } of cookies) peticion.cookies.set(name, value)

          // Re-derivar las cabeceras DESPUES de mutar las cookies. peticion.cookies.set
          // reescribe la cabecera Cookie de la peticion, y reutilizar aqui un snapshot
          // tomado antes de getUser() la dejaria vieja: en la peticion donde Supabase
          // refresca el token, el navegador recibiria la cookie nueva pero los Server
          // Components de ESA misma peticion seguirian leyendo la anterior.
          // cabecerasDePeticion() vuelve a leer peticion.headers y reinyecta tanto
          // x-nonce como la CSP: si la respuesta se reconstruye sin la CSP, Next
          // pierde el nonce justo en las peticiones que refrescan el token.
          respuesta = NextResponse.next({ request: { headers: cabecerasDePeticion() } })
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
    // El mismo objeto que se uso para la cabecera de peticion: la CSP de la
    // respuesta y la que ve Next tienen que ser la misma cadena, con el mismo
    // nonce. Recalcularla aqui invitaba a que divergieran.
    for (const [clave, valor] of Object.entries(cabecerasSeguridad)) {
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
