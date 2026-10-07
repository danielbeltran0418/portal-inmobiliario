import Link from 'next/link'
import { sesionActual } from '@/lib/auth/sesion'
import { ENLACE_REGISTRO, estadoDeCabecera } from '@/lib/navegacion/enlaces'
import { cerrarSesion } from './acciones-sesion'
import { MenuMovil } from './ui/compuestos'

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
    <header className="sticky top-0 z-50 border-b border-linea bg-superficie/95 backdrop-blur-sm">
      <nav
        aria-label="Principal"
        className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6"
      >
        <Link href="/" className="flex shrink-0 items-center gap-2">
          {/* Isotipo sobre el verde de la marca, como en el diseño de Figma Make */}
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-marca text-marca-contraste">
            <svg
              className="h-4 w-4"
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
          <span className="font-titulo text-lg leading-none font-semibold text-tinta">
            Portal<span className="font-sans text-sm font-medium text-tinta-suave"> Inmobiliario</span>
          </span>
        </Link>

        <div className="hidden items-center gap-2 md:flex">
          {enlaces.map((enlace) => (
            <Link
              key={enlace.destino}
              href={enlace.destino}
              className={
                enlace.destino === ENLACE_REGISTRO.destino
                  ? 'rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte'
                  : 'rounded-lg px-4 py-2 text-sm font-medium text-tinta-suave transition-colors hover:bg-superficie-alt hover:text-tinta'
              }
            >
              {enlace.etiqueta}
            </Link>
          ))}

          {autenticado && (
            /**
             * Un formulario, no un enlace. Ver el porque en
             * src/components/acciones-sesion.ts.
             */
            <form action={cerrarSesion}>
              <button
                type="submit"
                className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-tinta-suave transition-colors hover:bg-superficie-alt hover:text-tinta"
              >
                Cerrar sesión
              </button>
            </form>
          )}
        </div>
        <MenuMovil enlaces={enlaces} cerrarSesion={cerrarSesion} autenticado={autenticado} />
      </nav>
    </header>
  )
}
