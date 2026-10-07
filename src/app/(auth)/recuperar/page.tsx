import type { Metadata } from 'next'
import { claveDeSitioTurnstile } from '@/lib/seguridad/turnstile'
import { MENSAJE_ENLACE_RECUPERACION } from '@/lib/auth/recuperacion'
import { GuionTurnstile } from '../guion-turnstile'
import { FormularioRecuperar } from './formulario'

export const metadata: Metadata = {
  title: 'Recuperar contraseña | Portal Inmobiliario',
  description: 'Recibe en tu correo un enlace para crear una contraseña nueva en el Portal Inmobiliario.',
  robots: { index: false, follow: false },
}

/** Mismo corte servidor/cliente que /login (ver su page.tsx). */
export default async function PaginaRecuperar(
  { searchParams }: { searchParams: Promise<{ enlace?: string }> },
) {
  const { enlace } = await searchParams
  // Solo un valor fijo decide el aviso; el texto nunca sale de la URL.
  const aviso = enlace === 'invalido' ? MENSAJE_ENLACE_RECUPERACION : null
  return (
    <>
      <GuionTurnstile />
      <FormularioRecuperar claveTurnstile={claveDeSitioTurnstile()} aviso={aviso} />
    </>
  )
}
