import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Verifica tu correo | Portal Inmobiliario',
  description:
    'Activa tu cuenta del Portal Inmobiliario de Barranquilla abriendo el enlace de ' +
    'confirmación que te enviamos por correo.',
}

export default function PaginaVerificarCorreo() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Verifica tu correo</h1>
      <p className="mt-4">
        Tu cuenta todavía no está activa. Abre el enlace que te enviamos para continuar.
      </p>
    </main>
  )
}
