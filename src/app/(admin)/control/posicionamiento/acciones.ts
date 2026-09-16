'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
import { rolDesdeToken } from '@/lib/auth/roles'
import {
  registrarPagoPosicionamiento,
  cancelarPagoPosicionamiento,
  type ResultadoPagoPosicionamiento,
} from '@/lib/admin/posicionamiento'

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

export async function accionRegistrarPagoPosicionamiento(
  _estadoAnterior: ResultadoPagoPosicionamiento,
  formData: FormData,
): Promise<ResultadoPagoPosicionamiento> {
  const { cliente, adminId } = await verificarSuperAdmin()
  const admin = crearClienteAdmin()

  const raw = {
    propiedad_id: formData.get('propiedad_id'),
    monto: formData.get('monto'),
    moneda: formData.get('moneda') || 'COP',
    fecha_inicio: formData.get('fecha_inicio'),
    fecha_fin: formData.get('fecha_fin'),
    notas: formData.get('notas'),
    referencia_externa: formData.get('referencia_externa'),
  }

  const resultado = await registrarPagoPosicionamiento(cliente, admin, raw, adminId)

  if (resultado.ok) {
    revalidatePath('/control/posicionamiento')
    revalidatePath('/control')
    revalidatePath('/catalogo')
    revalidatePath('/')
  }

  return resultado
}

export async function accionCancelarPagoPosicionamiento(
  pagoId: string,
  motivo: string,
): Promise<ResultadoPagoPosicionamiento> {
  const { cliente, adminId } = await verificarSuperAdmin()
  const admin = crearClienteAdmin()

  const resultado = await cancelarPagoPosicionamiento(cliente, admin, pagoId, motivo, adminId)

  if (resultado.ok) {
    revalidatePath('/control/posicionamiento')
    revalidatePath('/control')
    revalidatePath('/catalogo')
    revalidatePath('/')
  }

  return resultado
}
