import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { accesoAdmin } from '@/lib/auth/admin'
import { RUTA_DOBLE_FACTOR } from '@/lib/auth/roles'
import { NavegacionAdmin } from '@/components/admin/NavegacionAdmin'

export const metadata: Metadata = {
  title: 'Panel de Control | Portal Inmobiliario',
  description: 'Administración, moderación y métricas del sistema.',
  robots: { index: false, follow: false },
}

export default async function LayoutControl({
  children,
}: {
  children: React.ReactNode
}) {
  // Rol de la base y segundo factor: ver src/lib/auth/admin.ts. El proxy ya
  // filtra lo mismo; esto es la segunda capa, por si cambia el matcher.
  const acceso = await accesoAdmin()
  if (acceso.estado === 'sin_sesion') redirect('/login')
  if (acceso.estado === 'no_admin') redirect('/')
  if (acceso.estado === 'falta_mfa') redirect(RUTA_DOBLE_FACTOR)

  return (
    <div className="min-h-dvh bg-fondo">
      <NavegacionAdmin />
      <div className="mx-auto max-w-6xl px-6 py-8">
        {children}
      </div>
    </div>
  )
}
