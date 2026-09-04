import { claveDeSitioTurnstile } from '@/lib/seguridad/turnstile'
import { GuionTurnstile } from '../guion-turnstile'
import { FormularioRegistro } from './formulario'

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
