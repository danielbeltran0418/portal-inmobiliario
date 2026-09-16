'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ENLACES_ADMIN = [
  { href: '/control', etiqueta: 'Resumen' },
  { href: '/control/moderacion', etiqueta: 'Moderación' },
  { href: '/control/posicionamiento', etiqueta: 'Posicionamiento' },
  { href: '/control/metricas', etiqueta: 'Métricas e IA' },
  { href: '/control/auditoria', etiqueta: 'Auditoría' },
]

export function NavegacionAdmin() {
  const rutaActual = usePathname()

  return (
    <nav aria-label="Navegación del panel de control" className="border-b border-linea bg-superficie">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/control"
            className="font-titulo text-lg font-bold tracking-tight text-tinta hover:text-marca"
          >
            Panel de Control
          </Link>
          <span className="rounded-full bg-marca-suave px-2.5 py-0.5 text-xs font-semibold text-marca-fuerte">
            Super Admin
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          {ENLACES_ADMIN.map((enlace) => {
            const activo =
              enlace.href === '/control'
                ? rutaActual === '/control'
                : rutaActual.startsWith(enlace.href)

            return (
              <Link
                key={enlace.href}
                href={enlace.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activo
                    ? 'bg-marca text-white shadow-xs'
                    : 'text-tinta-suave hover:bg-superficie-alt hover:text-tinta'
                }`}
              >
                {enlace.etiqueta}
              </Link>
            )
          })}
        </div>

        <div>
          <Link
            href="/"
            className="text-xs font-medium text-tinta-suave hover:text-marca"
          >
            &larr; Volver al portal
          </Link>
        </div>
      </div>
    </nav>
  )
}
