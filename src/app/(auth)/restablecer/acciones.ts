'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { esquemaNuevaContrasena } from '@/lib/validacion/esquemas'
import { MENSAJE_GENERICO } from '@/lib/errores/mapear'
import { rolDesdeToken, rutaDePanel } from '@/lib/auth/roles'
import { COOKIE_RECUPERACION, MENSAJE_ENLACE_RECUPERACION } from '@/lib/auth/recuperacion'

export interface EstadoRestablecer {
  error?: string
}

export async function restablecerContrasena(
  _estado: EstadoRestablecer,
  formData: FormData,
): Promise<EstadoRestablecer> {
  const analisis = esquemaNuevaContrasena.safeParse({
    password: formData.get('password'),
    confirmacion: formData.get('confirmacion'),
  })
  if (!analisis.success) return { error: analisis.error.issues[0]?.message ?? MENSAJE_GENERICO }

  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  const almacen = await cookies()
  // La marca la pone solo /confirmar/recuperacion, y tiene que ser de ESTE
  // usuario: una sesion cualquiera no basta para cambiar la clave sin la actual.
  if (!user || almacen.get(COOKIE_RECUPERACION)?.value !== user.id) {
    return { error: MENSAJE_ENLACE_RECUPERACION }
  }

  const { error } = await supabase.auth.updateUser({ password: analisis.data.password })
  if (error) {
    return {
      error: error.code === 'same_password'
        ? 'La contraseña nueva tiene que ser distinta de la anterior.'
        : error.code === 'weak_password'
          ? 'Esa contraseña es demasiado débil. Prueba con una más larga o menos común.'
          : MENSAJE_GENERICO,
    }
  }

  almacen.delete(COOKIE_RECUPERACION)
  const { data: { session } } = await supabase.auth.getSession()
  redirect(rutaDePanel(rolDesdeToken(session?.access_token ?? '')))
}
