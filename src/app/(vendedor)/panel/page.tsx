import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Panel del vendedor | Portal Inmobiliario',
  description: 'Gestiona las propiedades que publicas en el Portal Inmobiliario de Barranquilla.',
  // Privada: no se indexa, y ademas no se sigue ningun enlace desde ella.
  robots: { index: false, follow: false },
}

export default function PaginaPanelVendedor() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Panel del vendedor</h1>
      <p className="mt-4">Gestión de publicaciones. Se construye en el SP3.</p>
    </main>
  )
}
