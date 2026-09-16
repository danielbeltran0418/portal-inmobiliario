import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { rolDesdeToken } from '@/lib/auth/roles'
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
  const sesion = await sesionActual()
  if (!sesion.hayUsuario || !sesion.accessToken) {
    redirect('/login')
  }

  const rol = rolDesdeToken(sesion.accessToken)
  if (rol !== 'super_admin') {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-fondo">
      <NavegacionAdmin />
      <div className="mx-auto max-w-6xl px-6 py-8">
        {children}
      </div>
    </div>
  )
}
