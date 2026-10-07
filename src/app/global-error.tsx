'use client'

import { useEffect } from 'react'
import './globals.css'

/**
 * Ultimo recurso: un error en el propio layout raiz (la cabecera, por ejemplo).
 * Sustituye al layout, asi que trae su propio <html lang="es"> y la hoja de
 * estilos. Sin esto, Next pintaba su pantalla por defecto en ingles.
 */
export default function ErrorGlobal({
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
    <html lang="es">
      <body className="flex min-h-dvh items-center justify-center bg-fondo px-4 text-center text-tinta antialiased">
        <title>Algo salió mal | Portal Inmobiliario</title>
        <main className="max-w-md">
          <h1 className="text-3xl font-semibold">Algo salió mal</h1>
          <p className="mt-2 text-tinta-suave">
            El portal no pudo cargarse. Vuelve a intentarlo en un momento.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-8 inline-flex cursor-pointer items-center rounded-xl bg-marca px-5 py-2.5 text-sm font-semibold text-marca-contraste hover:bg-marca-fuerte"
          >
            Intentar de nuevo
          </button>
          {error.digest && <p className="mt-6 text-xs text-tinta-tenue">Código del error: {error.digest}</p>}
        </main>
      </body>
    </html>
  )
}
