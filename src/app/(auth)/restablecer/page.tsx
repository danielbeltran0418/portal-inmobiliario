import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth/sesion'
import { COOKIE_RECUPERACION } from '@/lib/auth/recuperacion'
import { FormularioRestablecer } from './formulario'

export const metadata: Metadata = {
  title: 'Nueva contraseña | Portal Inmobiliario',
  description: 'Crea una contraseña nueva para tu cuenta del Portal Inmobiliario.',
  robots: { index: false, follow: false },
}

/**
 * Solo se llega aqui desde /confirmar/recuperacion. Sin la sesion del enlace,
 * o sin la marca de ESE usuario, se vuelve a pedir el correo: la accion lo
 * comprueba otra vez; esto solo evita pintar un formulario que no serviria.
 */
export default async function PaginaRestablecer() {
  const sesion = await sesionActual()
  const marca = (await cookies()).get(COOKIE_RECUPERACION)?.value
  if (!sesion.idUsuario || marca !== sesion.idUsuario) redirect('/recuperar?enlace=invalido')
  return <FormularioRestablecer />
}
