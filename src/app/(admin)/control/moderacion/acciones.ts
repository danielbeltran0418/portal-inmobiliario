'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
import { rolDesdeToken } from '@/lib/auth/roles'
import {
  suspenderPropiedad,
  reactivarPropiedad,
  eliminarPropiedadAdmin,
  type ResultadoModeracion,
} from '@/lib/admin/moderacion'

async function verificarSuperAdmin() {
  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: { session } } = await supabase.auth.getSession()
  const rol = rolDesdeToken(session?.access_token ?? '')
  if (rol !== 'super_admin') {
    throw new Error('Acceso no autorizado: requiere rol super_admin')
  }

  return { cliente: supabase, adminId: user.id }
}

export async function accionSuspenderPropiedad(
  propiedadId: string,
  motivo: string,
): Promise<ResultadoModeracion> {
  const { cliente, adminId } = await verificarSuperAdmin()
  const admin = crearClienteAdmin()

  const resultado = await suspenderPropiedad(cliente, admin, propiedadId, motivo, adminId)

  if (resultado.ok) {
    revalidatePath('/control/moderacion')
    revalidatePath('/control')
    revalidatePath('/catalogo')
    revalidatePath('/')
  }

  return resultado
}

export async function accionReactivarPropiedad(
  propiedadId: string,
): Promise<ResultadoModeracion> {
  const { cliente, adminId } = await verificarSuperAdmin()
  const admin = crearClienteAdmin()

  const resultado = await reactivarPropiedad(cliente, admin, propiedadId, adminId)

  if (resultado.ok) {
    revalidatePath('/control/moderacion')
    revalidatePath('/control')
    revalidatePath('/catalogo')
    revalidatePath('/')
  }

  return resultado
}

export async function accionEliminarPropiedadAdmin(
  propiedadId: string,
  motivo: string,
): Promise<ResultadoModeracion> {
  const { cliente, adminId } = await verificarSuperAdmin()
  const admin = crearClienteAdmin()

  const resultado = await eliminarPropiedadAdmin(cliente, admin, propiedadId, motivo, adminId)

  if (resultado.ok) {
    revalidatePath('/control/moderacion')
    revalidatePath('/control')
    revalidatePath('/catalogo')
    revalidatePath('/')
  }

  return resultado
}
