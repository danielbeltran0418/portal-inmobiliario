'use server'

import { headers } from 'next/headers'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { esquemaRegistro } from '@/lib/validacion/esquemas'
import {
  mapearError,
  MENSAJE_CAPTCHA,
  MENSAJE_REGISTRO_BLOQUEADO,
  MENSAJE_SIN_IP_CONFIABLE,
} from '@/lib/errores/mapear'
import { accionBloqueada, registrarIntentoAccion } from '@/lib/auth/limite-intentos'
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

  const { nombre, correo, telefono, password, rol } = analisis.data

  const ip = ipDeConfianza(await headers())

  /**
   * Sin IP de confianza no hay limite de registro posible, y se rechaza.
   *
   * Para el login, ip nula degrada a contar por correo -- mas estricto, no
   * falsificable. Aqui esa degradacion no existe: el spam de altas usa un
   * correo distinto en cada intento, asi que "contar por clave" seria contar
   * uno cada vez, es decir, SIN LIMITE. Ese es justo el modo de fallo que
   * src/lib/http/ip-cliente.ts se escribio para evitar, asi que se falla
   * cerrado en vez de degradar.
   *
   * Consecuencia buscada: un despliegue sin IP_CABECERA_CONFIABLE no permite
   * registrar a nadie. Es ruidoso y se arregla en un minuto; la alternativa
   * es un agujero silencioso.
   */
  if (ip === null) {
    return { error: MENSAJE_SIN_IP_CONFIABLE }
  }

  /**
   * Limite de registro (migracion 20260911000200): cuenta ALTAS EXITOSAS por
   * IP, no fallos -- el login cuenta fallos, pero el spam de altas es todo
   * exitoso y con un correo distinto cada vez, asi que contar fallos aqui no
   * bloquearia nada.
   *
   * Va ANTES del captcha por el mismo motivo que en el login: a una conexion
   * ya bloqueada se le responde sin gastar una peticion a Cloudflare.
   */
  if (await accionBloqueada('registro', correo, ip)) {
    return { error: MENSAJE_REGISTRO_BLOQUEADO }
  }

  /**
   * Captcha (hallazgo I4). El limite de arriba solo frena a quien repite IP;
   * el captcha sigue siendo la barrera contra las altas que vienen de una IP
   * distinta cada vez.
   *
   * Se verifica en el SERVIDOR contra siteverify. Con las variables de
   * Turnstile sin definir, verificarTurnstile devuelve true sin mirar nada y
   * este bloque no cambia el comportamiento.
   */
  if (!(await verificarTurnstile(formData.get(CAMPO_TURNSTILE), ip))) {
    return { error: MENSAJE_CAPTCHA }
  }

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

  // Solo el alta EXITOSA cuenta: es lo que mide esta regla.
  await registrarIntentoAccion('registro', correo, ip, true)

  return { exito: true }
}
