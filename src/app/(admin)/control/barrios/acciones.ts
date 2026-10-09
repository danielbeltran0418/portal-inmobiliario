'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
import { accesoAdmin } from '@/lib/auth/admin'
import { cambiarEstadoBarrio, crearBarrio } from '@/lib/admin/barrios'

export interface EstadoBarrio {
  error?: string
  creado?: string
}

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

/**
 * Mismo control que las acciones de moderacion: rol super_admin leido de la
 * base y sesion aal2. Importa mas aqui: estas acciones escriben con
 * service_role, asi que RLS no vuelve a comprobar nada.
 */
async function idSuperAdmin(): Promise<string | null> {
  const acceso = await accesoAdmin()
  return acceso.estado === 'ok' ? acceso.adminId : null
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
