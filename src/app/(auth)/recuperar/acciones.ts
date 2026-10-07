'use server'

import { headers } from 'next/headers'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { esquemaRecuperacion } from '@/lib/validacion/esquemas'
import { MENSAJE_CAPTCHA, MENSAJE_GENERICO } from '@/lib/errores/mapear'
import { accionBloqueada, registrarIntentoAccion } from '@/lib/auth/limite-intentos'
import { ipDeConfianza } from '@/lib/http/ip-cliente'
import { origenReal } from '@/lib/http/origen-peticion'
import { MENSAJE_RECUPERACION_ENVIADA } from '@/lib/auth/recuperacion'
import { CAMPO_TURNSTILE, verificarTurnstile } from '@/lib/seguridad/turnstile'

export interface EstadoRecuperacion {
  error?: string
  enviado?: boolean
  mensaje?: string
}

const ENVIADO: EstadoRecuperacion = { enviado: true, mensaje: MENSAJE_RECUPERACION_ENVIADA }

export async function solicitarRecuperacion(
  _estado: EstadoRecuperacion,
  formData: FormData,
): Promise<EstadoRecuperacion> {
  const analisis = esquemaRecuperacion.safeParse({ correo: formData.get('correo') })
  if (!analisis.success) return { error: 'Escribe un correo válido.' }
  const { correo } = analisis.data

  const cabeceras = await headers()
  const ip = ipDeConfianza(cabeceras)

  // Limite por correo (y por IP si es de confianza), migracion
  // 20261008000100: frena el bombardeo de correos contra una victima.
  if (await accionBloqueada('recuperar', correo, ip)) return ENVIADO

  if (!(await verificarTurnstile(formData.get(CAMPO_TURNSTILE), ip))) {
    return { error: MENSAJE_CAPTCHA }
  }

  // Se cuenta ANTES de enviar: si no se puede contabilizar, el limitador
  // estaria ciego y se falla cerrado, como en el login.
  if (!(await registrarIntentoAccion('recuperar', correo, ip, true))) {
    return { error: MENSAJE_GENERICO }
  }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.resetPasswordForEmail(correo, {
    redirectTo: `${origenReal({ headers: cabeceras })}/confirmar/recuperacion`,
  })
  // El error (correo inexistente, limite de Supabase...) no se le muestra a
  // quien pide: solo queda en el log del servidor, sin el correo.
  if (error) console.error('[recuperar] resetPasswordForEmail fallo:', error.code ?? error)

  return ENVIADO
}
