'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'

/**
 * Error inesperado al pintar una ruta (envuelve todas las paginas, dentro del
 * layout raiz: la cabecera y el pie siguen visibles).
 *
 * No se muestra error.message: en produccion Next ya lo sustituye por un texto
 * generico para los errores de servidor, y en desarrollo traeria detalles
 * internos. Si se muestra el digest: es lo que permite encontrar el error en
 * los logs del servidor cuando alguien lo reporta.
 *
 * En Next 16 la prop para reintentar es `retry` (antes `reset`).
 */
export default function ErrorDeRuta({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-peligro-suave">
        <TriangleAlert aria-hidden="true" className="h-8 w-8 text-peligro" strokeWidth={1.5} />
      </span>
      <h1 className="font-titulo text-3xl font-semibold text-tinta">Algo salió mal</h1>
      <p className="mt-2 text-tinta-suave">
        No pudimos cargar esta página. Suele ser algo pasajero: vuelve a intentarlo en un momento.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex cursor-pointer items-center rounded-xl bg-marca px-5 py-2.5 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte"
        >
          Intentar de nuevo
        </button>
        <Link
          href="/"
          className="inline-flex items-center rounded-xl border border-linea px-5 py-2.5 text-sm font-medium text-tinta transition-colors hover:border-marca hover:text-marca"
        >
          Ir al inicio
        </Link>
      </div>
      {error.digest && (
        <p className="cifra mt-6 text-xs text-tinta-tenue">Código del error: {error.digest}</p>
      )}
    </main>
  )
}
