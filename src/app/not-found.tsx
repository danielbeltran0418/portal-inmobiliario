import type { Metadata } from 'next'
import Link from 'next/link'
import { SearchX } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Página no encontrada | Portal Inmobiliario',
  robots: { index: false, follow: false },
}

/**
 * 404 del portal. Sin esto se veia la pagina por defecto de Next, en ingles
 * ("This page could not be found"). Cubre las rutas que no existen y cada
 * notFound() (un barrio inexistente, una ficha que ya no esta publicada).
 */
export default function NoEncontrado() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-marca-suave">
        <SearchX aria-hidden="true" className="h-8 w-8 text-marca" strokeWidth={1.5} />
      </span>
      <h1 className="font-titulo text-3xl font-semibold text-tinta">Esta página no existe</h1>
      <p className="mt-2 text-tinta-suave">
        Puede que el enlace esté mal escrito o que la propiedad ya no esté publicada.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center rounded-xl bg-marca px-5 py-2.5 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte"
      >
        Volver al inicio
      </Link>
    </main>
  )
}
