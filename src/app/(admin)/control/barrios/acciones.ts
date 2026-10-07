'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
import { rolDesdeToken } from '@/lib/auth/roles'
import { cambiarEstadoBarrio, crearBarrio } from '@/lib/admin/barrios'

export interface EstadoBarrio {
  error?: string
  creado?: string
}

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

/** Mismo control que las acciones de moderacion: sesion valida y rol super_admin. */
async function idSuperAdmin(): Promise<string | null> {
  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: { session } } = await supabase.auth.getSession()
  return rolDesdeToken(session?.access_token ?? '') === 'super_admin' ? user.id : null
}

function revalidar() {
  revalidatePath('/control/barrios')
  revalidatePath('/')
}

export async function accionCrearBarrio(_previo: EstadoBarrio, formData: FormData): Promise<EstadoBarrio> {
  const adminId = await idSuperAdmin()
  if (!adminId) return { error: 'Acceso no autorizado.' }
  const r = await crearBarrio(crearClienteAdmin(), { nombre: formData.get('nombre'), ciudad: formData.get('ciudad') }, adminId)
  if (!r.ok) return { error: r.error }
  revalidar()
  return { creado: r.slug }
}

export async function accionCambiarEstadoBarrio(formData: FormData): Promise<void> {
  const adminId = await idSuperAdmin()
  const id = formData.get('id')
  if (!adminId || typeof id !== 'string' || !UUID.test(id)) return
  await cambiarEstadoBarrio(crearClienteAdmin(), id, formData.get('activo') === 'true', adminId)
  revalidar()
}
