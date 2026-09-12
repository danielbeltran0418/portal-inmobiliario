'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { MENSAJE_GENERICO, MENSAJE_LEAD_YA_RESPONDIDO } from '@/lib/errores/mapear'

async function cambiarEstadoLead(id: string, estado: 'aceptado' | 'descartado') {
  const { data, error } = await (await crearClienteServidor())
    .from('leads').update({ estado }).eq('id', id).select('id')

  // .select() encadenado a proposito: un UPDATE de PostgREST que afecta CERO
  // filas devuelve error null. Sin el, un lead ajeno o ya respondido pasaria
  // por exito.
  if (error) {
    return { error: /ya fue respondido/i.test(error.message) ? MENSAJE_LEAD_YA_RESPONDIDO : MENSAJE_GENERICO }
  }
  if (!data || data.length === 0) return { error: MENSAJE_LEAD_YA_RESPONDIDO }

  revalidatePath('/panel/leads')
  revalidatePath('/panel')
  return {}
}

export async function aceptarLead(formData: FormData) {
  const id = formData.get('id')
  if (typeof id !== 'string') return { error: MENSAJE_GENERICO }
  return cambiarEstadoLead(id, 'aceptado')
}

export async function descartarLead(formData: FormData) {
  const id = formData.get('id')
  if (typeof id !== 'string') return { error: MENSAJE_GENERICO }
  return cambiarEstadoLead(id, 'descartado')
}
