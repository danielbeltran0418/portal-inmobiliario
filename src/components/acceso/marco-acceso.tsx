import type { ReactNode } from 'react'
import Link from 'next/link'

function Isotipo({ claro = false }: { claro?: boolean }) {
  return (
    <span
      className={`flex h-8 w-8 items-center justify-center rounded-lg ${claro ? 'bg-white/20 backdrop-blur-sm' : 'bg-marca'}`}
    >
      <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
        <polyline points="9 21 9 12 15 12 15 21" />
      </svg>
    </span>
  )
}

/**
 * Marco de las pantallas de acceso (login y registro), segun el diseño de
 * Figma Make: foto a la izquierda en escritorio y el formulario a la derecha.
 *
 * Sin testimonios: el prototipo traia una cita de una compradora ficticia, y
 * un testimonio inventado no se publica. En su lugar va lo que el portal hace.
 * La foto (public/acceso.jpg) es decorativa: aria-hidden y sin alt.
 *
 * Componente sin estado ni 'use client': lo usan los formularios de cliente y
 * se pinta igual en el servidor.
 */
export function MarcoAcceso({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 bg-fondo">
      <div className="relative hidden overflow-hidden lg:flex lg:w-1/2">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[#1F1B14] bg-cover bg-center"
          style={{
            backgroundImage:
              'linear-gradient(to top, rgb(31 27 20 / 0.75), rgb(31 27 20 / 0.3) 50%, transparent), url(/acceso.jpg)',
          }}
        />
        <div className="relative mt-auto p-12">
          <Link href="/" className="mb-10 flex items-center gap-2 font-titulo font-semibold text-white">
            <Isotipo claro />
            Portal Inmobiliario
          </Link>
          <p className="max-w-md font-titulo text-2xl leading-relaxed text-white">
            Vivienda en venta y arriendo, sin intermediarios.
          </p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/75">
            Habla directo con quien publica y agenda tu visita con el asistente de IA.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12 lg:p-12">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center gap-2 font-titulo font-semibold text-tinta lg:hidden">
            <Isotipo />
            Portal Inmobiliario
          </Link>
          {children}
        </div>
      </div>
    </main>
  )
}
