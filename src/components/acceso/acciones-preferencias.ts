'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'

export interface EstadoPreferencias { error?: string; guardado?: boolean }
export async function guardarPreferencias(_estado: EstadoPreferencias, formulario: FormData): Promise<EstadoPreferencias> {
  const casilla = z.literal('on').optional().transform(valor => valor === 'on')
  const datos = z.object({ leads: casilla, precios: casilla, whatsapp: casilla }).safeParse({
    leads: formulario.get('avisos_leads') ?? undefined, precios: formulario.get('avisos_precios') ?? undefined, whatsapp: formulario.get('avisos_leads_whatsapp') ?? undefined,
  })
  if (!datos.success) return { error: 'Revisa tus preferencias de avisos.' }
  const sesion = await sesionActual()
  if (!sesion.idUsuario) return { error: 'Inicia sesión para cambiar tus preferencias.' }
  const cliente = await crearClienteServidor()
  const whatsapp = process.env.WHATSAPP_AVISOS_ENABLED === 'true' && datos.data.whatsapp
  if (whatsapp) {
    const { data: { user } } = await cliente.auth.getUser()
    if (!user?.phone_confirmed_at || !user.phone || !/^\+573\d{9}$/.test(user.phone)) return { error: 'Confirma primero el celular de tu cuenta para recibir avisos por WhatsApp.' }
  }
  const { data, error } = await cliente.from('preferencias_notificacion').upsert({ usuario_id: sesion.idUsuario, avisos_leads_whatsapp: whatsapp, avisos_leads: datos.data.leads, avisos_precios: datos.data.precios }).select('usuario_id').single()
  if (error || !data) return { error: 'No pudimos guardar tus preferencias.' }
  revalidatePath('/mi-cuenta/favoritos'); revalidatePath('/panel')
  return { guardado: true }
}