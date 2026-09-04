import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mi cuenta | Portal Inmobiliario',
  description: 'Tu cuenta de comprador en el Portal Inmobiliario de Barranquilla.',
  // Privada: no se indexa, y ademas no se sigue ningun enlace desde ella.
  robots: { index: false, follow: false },
}

export default function PaginaMiCuenta() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Mi cuenta</h1>
      <p className="mt-4">Panel del comprador. Se construye en el SP2.</p>
    </main>
  )
}
