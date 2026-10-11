'use server'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { rolDesdeToken } from '@/lib/auth/roles'
import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
export interface EstadoEquipo { error?: string; mensaje?: string; codigo?: string }
export async function invitarAgente(_estado: EstadoEquipo, datos: FormData): Promise<EstadoEquipo> {
  if (process.env.EQUIPOS_PRO_ENABLED !== 'true') return { error: 'Los equipos todavía no están disponibles.' }
  const correo = z.email().max(254).safeParse(datos.get('correo'))
  if (!correo.success) return { error: 'Escribe un correo válido.' }
  const db = await crearClienteServidor()
  const { data: { user } } = await db.auth.getUser()
  if (!user || rolDesdeToken((await db.auth.getSession()).data.session?.access_token ?? '') !== 'vendedor') return { error: 'Entra con tu cuenta de agente.' }
  const { data: plan, error } = await db.from('suscripciones_plan').select('plan').eq('usuario_id', user.id).gt('vigente_hasta', new Date().toISOString()).maybeSingle()
  if (error || plan?.plan !== 'pro') return { error: 'La gestión del equipo requiere un plan Pro activo.' }
  if (correo.data.toLowerCase() === user.email?.toLowerCase()) return { error: 'Invita a otro agente de tu equipo.' }
  const admin = crearClienteAdmin()
  const { count, error: errorLimite } = await admin.from('equipo_invitaciones').select('id', { count: 'exact', head: true }).eq('propietario_id',user.id).gt('vence_en',new Date().toISOString())
  if (errorLimite || count === null || count >= 20) return { error: 'Ya tienes 20 invitaciones vigentes. Espera a que caduquen.' }
  const codigo = randomBytes(32).toString('hex')
  const { error: errorInsertar } = await admin.from('equipo_invitaciones').insert({ propietario_id: user.id, correo: correo.data.toLowerCase(), token_hash: createHash('sha256').update(codigo).digest('hex') }).select('id').single()
  return errorInsertar ? { error: 'No pudimos crear la invitación.' } : { codigo, mensaje: 'Comparte este código con el agente indicado. Caduca en 48 horas y solo funciona con su correo confirmado.' }
}
export async function aceptarEquipo(_estado: EstadoEquipo, datos: FormData): Promise<EstadoEquipo> {
  if (process.env.EQUIPOS_PRO_ENABLED !== 'true') return { error: 'Los equipos todavía no están disponibles.' }
  const codigo = z.string().regex(/^[a-f0-9]{64}$/).safeParse(datos.get('codigo'))
  if (!codigo.success) return { error: 'Revisa el código de invitación.' }
  const db = await crearClienteServidor()
  const { data, error } = await db.rpc('aceptar_equipo', { p_hash: createHash('sha256').update(codigo.data).digest('hex') })
  if (error || !data) return { error: 'La invitación no está disponible para tu cuenta o ya caducó.' }
  revalidatePath('/panel/equipo')
  return { mensaje: 'Ya formas parte del equipo.' }
}
export async function quitarAgente(datos: FormData): Promise<void> {
  if (process.env.EQUIPOS_PRO_ENABLED !== 'true') return
  const agente = z.uuid().safeParse(datos.get('agente'))
  if (!agente.success) return
  const db = await crearClienteServidor()
  const { data: { user } } = await db.auth.getUser()
  if (!user || rolDesdeToken((await db.auth.getSession()).data.session?.access_token ?? '') !== 'vendedor') return
  const { error } = await crearClienteAdmin().from('equipo_miembros').delete().eq('propietario_id',user.id).eq('agente_id',agente.data).select('agente_id').single()
  if (!error) revalidatePath('/panel/equipo')
}