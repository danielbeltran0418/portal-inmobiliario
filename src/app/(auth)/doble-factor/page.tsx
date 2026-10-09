import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { accesoAdmin } from '@/lib/auth/admin'
import { FormularioDobleFactor } from './formulario'

export const metadata: Metadata = {
  title: 'Verificación en dos pasos | Portal Inmobiliario',
  description: 'Segundo factor de acceso al panel de control.',
  robots: { index: false, follow: false },
}

/**
 * Segundo factor (TOTP) del super_admin (hallazgo M2). El proxy manda aqui a
 * quien entra en /control sin una sesion aal2. Si ya tiene un autenticador
 * verificado se le pide el codigo; si no, se le guia para darlo de alta.
 */
export default async function PaginaDobleFactor() {
  const acceso = await accesoAdmin()
  if (acceso.estado === 'sin_sesion') redirect('/login')
  if (acceso.estado === 'no_admin') redirect('/')
  if (acceso.estado === 'ok') redirect('/control')

  const { data } = await acceso.cliente.auth.mfa.listFactors()
  const factor = data?.totp[0]

  return <FormularioDobleFactor factorId={factor?.id ?? null} />
}
