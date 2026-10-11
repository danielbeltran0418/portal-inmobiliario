'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { metodosAcceso } from '@/lib/auth/metodos'
import { accionBloqueada, registrarIntentoAccion } from '@/lib/auth/limite-intentos'
import { ipDeConfianza } from '@/lib/http/ip-cliente'
import { origenReal } from '@/lib/http/origen-peticion'
import { CAMPO_TURNSTILE, verificarTurnstile } from '@/lib/seguridad/turnstile'
import { destinoTrasContrasena, rolDesdeToken } from '@/lib/auth/roles'

export interface EstadoAccesoAlternativo { error?: string; mensaje?: string; codigoEnviado?: boolean }
export async function accesoAlternativo(_estado: EstadoAccesoAlternativo, formulario: FormData): Promise<EstadoAccesoAlternativo> {
  const metodo = formulario.get('metodo')
  if (metodo !== 'google' && metodo !== 'apple' && metodo !== 'magicLink' && metodo !== 'sms') return { error: 'Método de acceso inválido.' }
  if (!metodosAcceso()[metodo]) return { error: 'Este método todavía no está disponible.' }
  const cabeceras = await headers()
  const ip = ipDeConfianza(cabeceras)
  const origen = origenReal({ headers: cabeceras })
  if (metodo === 'google' || metodo === 'apple') {
    const cliente = await crearClienteServidor()
    const { data, error } = await cliente.auth.signInWithOAuth({ provider: metodo, options: { redirectTo: `${origen}/confirmar`, skipBrowserRedirect: true } })
    if (error || !data.url) return { error: 'No pudimos iniciar este método. Inténtalo de nuevo.' }
    // Supabase construye la URL; nunca se toma un destino del formulario.
    const destino = new URL(data.url)
    if (destino.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin) return { error: 'No pudimos iniciar este método.' }
    redirect(data.url)
  }
  const analisis = metodo === 'magicLink'
    ? z.string().email().max(254).safeParse(formulario.get('correo'))
    : z.string().regex(/^\+573\d{9}$/).safeParse(formulario.get('telefono'))
  if (!analisis.success) return { error: metodo === 'sms' ? 'Escribe un celular colombiano con +57.' : 'Escribe un correo válido.' }
  const clave = analisis.data.toLowerCase()
  if (await accionBloqueada('login', clave, ip)) return { error: 'Demasiados intentos. Espera unos minutos.' }
  if (!(await verificarTurnstile(formulario.get(CAMPO_TURNSTILE), ip))) return { error: 'Completa la verificación de seguridad.' }
  // Contabilizar ANTES del envío evita que un proveedor caído permita spam ilimitado.
  if (!(await registrarIntentoAccion('login', clave, ip, false))) return { error: 'No podemos procesar el acceso ahora.' }
  const cliente = await crearClienteServidor()
  const codigo = formulario.get('codigo')
  if (metodo === 'sms' && typeof codigo === 'string' && codigo !== '') {
    if (!/^\d{6}$/.test(codigo)) return { error: 'El código debe tener seis dígitos.', codigoEnviado: true }
    const { data, error } = await cliente.auth.verifyOtp({ phone: clave, token: codigo, type: 'sms' })
    if (error || !data.session) return { error: 'El código no es válido o ha vencido.', codigoEnviado: true }
    await registrarIntentoAccion('login', clave, ip, true)
    redirect(destinoTrasContrasena(rolDesdeToken(data.session.access_token)))
  }
  if (metodo === 'magicLink') {
    await cliente.auth.signInWithOtp({ email: clave, options: { shouldCreateUser: false, emailRedirectTo: `${origen}/confirmar` } })
  } else {
    await cliente.auth.signInWithOtp({ phone: clave, options: { shouldCreateUser: false, channel: 'sms' } })
  }
  // Respuesta idéntica para cuentas existentes y desconocidas.
  return { mensaje: metodo === 'magicLink' ? 'Si tienes una cuenta, recibirás un enlace para entrar.' : 'Si tienes una cuenta asociada a este celular, recibirás un código.', codigoEnviado: metodo === 'sms' }
}