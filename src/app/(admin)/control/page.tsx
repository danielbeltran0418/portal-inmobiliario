import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Control del sistema | Portal Inmobiliario',
  description: 'Métricas y moderación del Portal Inmobiliario de Barranquilla.',
  // Privada: no se indexa, y ademas no se sigue ningun enlace desde ella.
  robots: { index: false, follow: false },
}

export default function PaginaControl() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Control del sistema</h1>
      <p className="mt-4">Métricas y moderación. Se construye en el SP7.</p>
    </main>
  )
}
