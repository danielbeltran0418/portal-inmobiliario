'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { esquemaLogin } from '@/lib/validacion/esquemas'
import { mapearError, MENSAJE_CREDENCIALES } from '@/lib/errores/mapear'
import { loginBloqueado, registrarIntentoLogin } from '@/lib/auth/limite-intentos'
import { rolDesdeToken, rutaDePanel } from '@/lib/auth/roles'

export interface EstadoFormulario {
  error?: string
}

const MENSAJE_BLOQUEADO =
  'Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentar.'

async function ipDeLaPeticion(): Promise<string> {
  const cabeceras = await headers()
  const reenviada = cabeceras.get('x-forwarded-for')
  return reenviada?.split(',')[0]?.trim() || '127.0.0.1'
}

export async function iniciarSesion(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaLogin.safeParse({
    correo: formData.get('correo'),
    password: formData.get('password'),
  })
  if (!analisis.success) return { error: MENSAJE_CREDENCIALES }

  const { correo, password } = analisis.data
  const ip = await ipDeLaPeticion()

  if (await loginBloqueado(correo, ip)) {
    return { error: MENSAJE_BLOQUEADO }
  }

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password })

  if (error || !data.session) {
    await registrarIntentoLogin(correo, ip, false)
    // El mismo mensaje para credenciales malas y usuario inexistente:
    // distinguirlos permitiria enumerar que correos tienen cuenta.
    return { error: error ? mapearError(error).mensaje : MENSAJE_CREDENCIALES }
  }

  await registrarIntentoLogin(correo, ip, true)
  redirect(rutaDePanel(rolDesdeToken(data.session.access_token)))
}
