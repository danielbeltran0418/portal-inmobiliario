import type { Metadata } from 'next'
import { claveDeSitioTurnstile } from '@/lib/seguridad/turnstile'
import { GuionTurnstile } from '../guion-turnstile'
import { FormularioLogin } from './formulario'
import { MENSAJE_VERIFICACION_FALLIDA } from '@/lib/errores/mapear'

export const metadata: Metadata = {
  title: 'Iniciar sesión | Portal Inmobiliario',
  description:
    'Entra a tu cuenta del Portal Inmobiliario de Barranquilla para gestionar tus ' +
    'publicaciones o tus búsquedas.',
}

/**
 * La pagina es un componente de SERVIDOR y el formulario un componente de
 * cliente aparte (hallazgo I4). El motivo del corte: el <script> de Turnstile
 * necesita el nonce de la CSP, que solo existe en la peticion, y la clave
 * publica del widget se decide en el servidor para que la bandera de entorno no
 * dependa de una variable NEXT_PUBLIC_ visible en el bundle.
 */
export default async function PaginaLogin(
  { searchParams }: { searchParams: Promise<{ volver?: string; verificacion?: string }> },
) {
  const { volver, verificacion } = await searchParams
  // Solo un valor fijo decide el aviso; el texto nunca sale de la URL.
  const aviso = verificacion === 'fallida' ? MENSAJE_VERIFICACION_FALLIDA : null
  return (
    <>
      <GuionTurnstile />
      <FormularioLogin
        claveTurnstile={claveDeSitioTurnstile()}
        volver={volver ?? null}
        aviso={aviso}
      />
    </>
  )
}
