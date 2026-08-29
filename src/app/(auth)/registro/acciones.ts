'use server'

import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { esquemaRegistro } from '@/lib/validacion/esquemas'
import { mapearError } from '@/lib/errores/mapear'

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
