import type { Metadata } from 'next'
import { claveDeSitioTurnstile } from '@/lib/seguridad/turnstile'
import { GuionTurnstile } from '../guion-turnstile'
import { FormularioRegistro } from './formulario'

export const metadata: Metadata = {
  title: 'Crear cuenta | Portal Inmobiliario',
  description:
    'Crea tu cuenta en el Portal Inmobiliario, como comprador para buscar ' +
    'vivienda o como vendedor para publicar tus propiedades.',
}

/**
 * Mismo corte que en /login y por el mismo motivo: ver el comentario de
 * src/app/(auth)/login/page.tsx.
 */
export default async function PaginaRegistro({ searchParams }: { searchParams: Promise<{ rol?: string }> }) {
  const { rol } = await searchParams
  const rolInicial = rol === 'vendedor' ? 'vendedor' : 'comprador'
  return (
    <>
      <GuionTurnstile />
      <FormularioRegistro claveTurnstile={claveDeSitioTurnstile()} rolInicial={rolInicial} />
    </>
  )
}
