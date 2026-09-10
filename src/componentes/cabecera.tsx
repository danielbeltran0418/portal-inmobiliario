import Link from 'next/link'
import { sesionActual } from '@/lib/auth/sesion'
import { estadoDeCabecera } from '@/lib/navegacion/enlaces'
import { cerrarSesion } from './acciones-sesion'

export const NOMBRE_DEL_SITIO = 'Portal Inmobiliario'

/**
 * Cabecera del sitio. Es un componente de SERVIDOR asincrono: la sesion se
 * resuelve en el servidor y al navegador solo le llega el HTML ya decidido.
 *
 * Sin componentes de cliente ni <script> propios a proposito. La CSP lleva
 * 'strict-dynamic' y no lleva 'unsafe-inline' para scripts, y aqui no hace
 * falta nada interactivo: los enlaces son enlaces y cerrar sesion es un
 * formulario que envia un server action por POST. Funciona incluso sin
 * JavaScript.
 *
 * Va en el layout raiz, que declara force-dynamic; el que sea dinamica no
 * cuesta nada extra.
 */
export async function Cabecera() {
  const { autenticado, enlaces } = estadoDeCabecera(await sesionActual())

  return (
    <header className="border-b border-linea bg-superficie">
      <nav
        aria-label="Principal"
        className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4"
      >
        <Link
          href="/"
          className="font-titulo text-xl font-semibold tracking-tight text-tinta hover:text-marca"
        >
          {NOMBRE_DEL_SITIO}
        </Link>

        <div className="flex flex-wrap items-center gap-5 text-sm">
          {enlaces.map((enlace) => (
            <Link
              key={enlace.destino}
              href={enlace.destino}
              className="text-tinta-suave hover:text-marca hover:underline"
            >
              {enlace.etiqueta}
            </Link>
          ))}

          {autenticado && (
            /**
             * Un formulario, no un enlace. Ver el porque en
             * src/componentes/acciones-sesion.ts.
             */
            <form action={cerrarSesion}>
              <button
                type="submit"
                className="cursor-pointer rounded-sm border border-linea px-3 py-1.5 text-tinta-suave hover:border-marca hover:text-marca"
              >
                Cerrar sesión
              </button>
            </form>
          )}
        </div>
      </nav>
    </header>
  )
}
