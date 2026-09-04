import type { Metadata } from 'next'
import { claveDeSitioTurnstile } from '@/lib/seguridad/turnstile'
import { GuionTurnstile } from '../guion-turnstile'
import { FormularioRegistro } from './formulario'

export const metadata: Metadata = {
  title: 'Crear cuenta | Portal Inmobiliario',
  description:
    'Crea tu cuenta en el Portal Inmobiliario de Barranquilla, como comprador para buscar ' +
    'vivienda o como vendedor para publicar tus propiedades.',
}

/**
 * Mismo corte que en /login y por el mismo motivo: ver el comentario de
 * src/app/(auth)/login/page.tsx.
 */
export default function PaginaRegistro() {
  return (
    <>
      <GuionTurnstile />
      <FormularioRegistro claveTurnstile={claveDeSitioTurnstile()} />
    </>
  )
}
