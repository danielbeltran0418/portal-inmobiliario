import Link from 'next/link'
import { NOMBRE_DEL_SITIO } from './cabecera'

export function PieDePagina() {
  const anio = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-linea/80 bg-superficie py-12 text-sm text-tinta-suave">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2 font-titulo text-lg font-semibold text-tinta">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-marca/10 text-marca">
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
              <span>{NOMBRE_DEL_SITIO}</span>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-tinta-suave">
              La plataforma de vivienda en Barranquilla pensada para conectar directamente a
              compradores y propietarios, sin comisiones de intermediación ni costos ocultos.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-tinta">Puertas de acceso</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/registro" className="transition-colors hover:text-marca">
                  Crear cuenta
                </Link>
              </li>
              <li>
                <Link href="/login" className="transition-colors hover:text-marca">
                  Iniciar sesión
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-tinta">Ciudad y confianza</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center gap-1.5 text-tinta-suave">
                <span>📍</span> Barranquilla, Atlántico
              </li>
              <li className="flex items-center gap-1.5 text-tinta-suave">
                <span>🔒</span> Habeas Data Ley 1581
              </li>
              <li className="flex items-center gap-1.5 text-tinta-suave">
                <span>🤝</span> Trato 100% directo
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-linea/60 pt-6 text-xs text-tinta-tenue sm:flex-row">
          <p>© {anio} {NOMBRE_DEL_SITIO}. Diseñado para el mercado inmobiliario de Barranquilla.</p>
          <p>Ubicación exacta protegida por protocolo de seguridad.</p>
        </div>
      </div>
    </footer>
  )
}
