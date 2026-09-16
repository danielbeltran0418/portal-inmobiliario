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
    <header className="sticky top-0 z-50 border-b border-linea/80 bg-superficie/90 backdrop-blur-md">
      <nav
        aria-label="Principal"
        className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-3.5"
      >
        <Link
          href="/"
          className="group flex items-center gap-2.5 font-titulo text-xl font-semibold tracking-tight text-tinta transition-colors hover:text-marca"
        >
          {/* Isotipo arquitectónico representativo del portal */}
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-marca/10 text-marca transition-transform group-hover:scale-105">
            <svg
              className="h-4.5 w-4.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
              <polyline points="9 21 9 12 15 12 15 21" />
            </svg>
          </span>
          <span>{NOMBRE_DEL_SITIO}</span>
        </Link>

        <div className="flex flex-wrap items-center gap-4 text-sm sm:gap-5">
          {enlaces.map((enlace) => (
            <Link
              key={enlace.destino}
              href={enlace.destino}
              className="font-medium text-tinta-suave transition-colors hover:text-marca"
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
                className="cursor-pointer rounded-sm border border-linea/90 bg-superficie px-3 py-1.5 text-xs font-medium text-tinta-suave shadow-xs transition-colors hover:border-marca hover:bg-superficie-alt hover:text-marca"
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
