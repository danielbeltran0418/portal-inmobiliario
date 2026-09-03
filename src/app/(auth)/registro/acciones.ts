'use server'

import { headers } from 'next/headers'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { esquemaRegistro } from '@/lib/validacion/esquemas'
import { mapearError, MENSAJE_CAPTCHA } from '@/lib/errores/mapear'
import { ipDeConfianza } from '@/lib/http/ip-cliente'
import { CAMPO_TURNSTILE, verificarTurnstile } from '@/lib/seguridad/turnstile'

export interface EstadoFormulario {
  error?: string
  exito?: boolean
}

export async function registrarUsuario(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  // Se valida en el servidor aunque el cliente ya haya validado:
  // el cliente es del atacante.
  const analisis = esquemaRegistro.safeParse({
    nombre: formData.get('nombre'),
    correo: formData.get('correo'),
    telefono: formData.get('telefono'),
    password: formData.get('password'),
    rol: formData.get('rol'),
  })

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Revisa los datos del formulario.' }
  }

  /**
   * Captcha (hallazgo I4). El registro no tiene limite de intentos que lo
   * proteja -- el de intentos_login solo cubre el login -- asi que aqui es la
   * unica barrera contra el alta masiva de cuentas.
   *
   * Se verifica en el SERVIDOR contra siteverify. Con las variables de
   * Turnstile sin definir, verificarTurnstile devuelve true sin mirar nada y
   * este bloque no cambia el comportamiento.
   */
  const ip = ipDeConfianza(await headers())
  if (!(await verificarTurnstile(formData.get(CAMPO_TURNSTILE), ip))) {
    return { error: MENSAJE_CAPTCHA }
  }

  const { nombre, correo, telefono, password, rol } = analisis.data
  const supabase = await crearClienteServidor()

  const { error } = await supabase.auth.signUp({
    email: correo,
    password,
    options: {
      // El trigger handle_new_user traduce esto contra una lista blanca.
      data: { nombre, telefono, rol_solicitado: rol },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://127.0.0.1:3000'}/confirmar`,
    },
  })

  if (error) {
    // Nunca se distingue "correo ya registrado": eso convertiria el
    // formulario en un verificador de que cuentas existen.
    return { error: mapearError(error).mensaje }
  }

  return { exito: true }
}
