'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { accesoAdmin } from '@/lib/auth/admin'
import { accionBloqueada, registrarIntentoAccion } from '@/lib/auth/limite-intentos'
import { ipDeConfianza } from '@/lib/http/ip-cliente'
import { MENSAJE_GENERICO } from '@/lib/errores/mapear'

export interface EstadoAlta {
  error?: string
  factorId?: string
  /** QR en data URI (SVG) que genera Supabase Auth. */
  qr?: string
  /** El mismo secreto en texto, para apps que no leen QR. */
  secreto?: string
}

export interface EstadoCodigo {
  error?: string
}

const MENSAJE_BLOQUEADO =
  'Demasiados códigos incorrectos. Espera 15 minutos antes de volver a intentarlo.'
const MENSAJE_CODIGO = 'Ese código no es válido. Revisa la hora de tu teléfono y vuelve a intentarlo.'
const CODIGO_TOTP = /^\d{6}$/

/**
 * Da de alta un factor TOTP nuevo para el super_admin.
 *
 * Solo si NO tiene ya uno verificado: con uno verificado, quien solo tiene la
 * contrasena no debe poder registrar un segundo dispositivo suyo (Supabase
 * Auth tambien lo exige, esto lo hace explicito). Los factores sin verificar
 * de intentos anteriores se borran para no chocar con el limite de factores.
 */
export async function iniciarAlta(): Promise<EstadoAlta> {
  const acceso = await accesoAdmin()
  if (acceso.estado === 'ok') redirect('/control')
  if (acceso.estado !== 'falta_mfa') redirect('/login')
  const { cliente } = acceso

  const { data: factores, error: errorLista } = await cliente.auth.mfa.listFactors()
  if (errorLista) return { error: MENSAJE_GENERICO }
  if (factores.totp.length > 0) return { error: 'Ya tienes un autenticador configurado. Introduce su código.' }

  for (const f of factores.all) {
    if (f.status !== 'verified') await cliente.auth.mfa.unenroll({ factorId: f.id })
  }

  const { data, error } = await cliente.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Portal ${new Date().toISOString()}`,
  })
  if (error || !data) {
    console.error('[doble-factor] enroll fallo:', error?.code ?? error)
    return { error: MENSAJE_GENERICO }
  }
  return { factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret }
}

/**
 * Verifica un codigo TOTP: confirma el alta de un factor nuevo o abre la
 * sesion aal2 con el ya existente. Limitado a 5 fallos por usuario cada 15
 * minutos (rama 'mfa' de accion_bloqueada): sin limite, 6 digitos se
 * adivinan.
 */
export async function verificarCodigo(_previo: EstadoCodigo, formData: FormData): Promise<EstadoCodigo> {
  const acceso = await accesoAdmin()
  if (acceso.estado === 'ok') redirect('/control')
  if (acceso.estado !== 'falta_mfa') redirect('/login')
  const { cliente, adminId } = acceso

  const factorId = formData.get('factor_id')
  const codigo = String(formData.get('codigo') ?? '').replace(/\s/g, '')
  if (typeof factorId !== 'string' || !factorId) return { error: MENSAJE_GENERICO }
  if (!CODIGO_TOTP.test(codigo)) return { error: 'Escribe los 6 dígitos que muestra tu app.' }

  const ip = ipDeConfianza(await headers())
  if (await accionBloqueada('mfa', adminId, ip)) return { error: MENSAJE_BLOQUEADO }

  const { error } = await cliente.auth.mfa.challengeAndVerify({ factorId, code: codigo })
  if (error) {
    const quedoRegistrado = await registrarIntentoAccion('mfa', adminId, ip, false)
    return { error: quedoRegistrado ? MENSAJE_CODIGO : MENSAJE_BLOQUEADO }
  }

  await registrarIntentoAccion('mfa', adminId, ip, true)
  redirect('/control')
}
