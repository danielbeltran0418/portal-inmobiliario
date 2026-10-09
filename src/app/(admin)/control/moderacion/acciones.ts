'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
import { accesoAdmin } from '@/lib/auth/admin'
import { RUTA_DOBLE_FACTOR } from '@/lib/auth/roles'
import {
  suspenderPropiedad,
  reactivarPropiedad,
  eliminarPropiedadAdmin,
  type ResultadoModeracion,
} from '@/lib/admin/moderacion'

async function verificarSuperAdmin() {
  // Rol leido de perfiles y sesion aal2: ver src/lib/auth/admin.ts.
  const acceso = await accesoAdmin()
  if (acceso.estado === 'sin_sesion') redirect('/login')
  if (acceso.estado === 'falta_mfa') redirect(RUTA_DOBLE_FACTOR)
  if (acceso.estado !== 'ok') {
    throw new Error('Acceso no autorizado: requiere rol super_admin')
  }

  return { cliente: acceso.cliente, adminId: acceso.adminId }
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
