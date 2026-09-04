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
    <header className="border-b border-black/10 dark:border-white/15">
      <nav
        aria-label="Principal"
        className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4"
      >
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {NOMBRE_DEL_SITIO}
        </Link>

        <div className="flex flex-wrap items-center gap-5 text-sm">
          {enlaces.map((enlace) => (
            <Link key={enlace.destino} href={enlace.destino} className="hover:underline">
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
                className="cursor-pointer rounded border border-black/20 px-3 py-1.5 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
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
