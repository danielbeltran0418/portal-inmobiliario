'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { MENSAJE_GENERICO, MENSAJE_LEAD_YA_RESPONDIDO } from '@/lib/errores/mapear'

// SQLSTATE propio que levanta validar_transicion_lead() cuando el lead ya
// salio de 'nuevo' (reenviar el mismo estado terminal, o pedir el otro). Ver
// supabase/migrations/20260912000100_corregir_transicion_lead.sql -- por
// codigo y no por texto del mensaje, mismo patron que CODIGO_NO_PUBLICADA /
// CODIGO_PROPIA en src/app/[barrio]/[slug]/acciones.ts: el mensaje es texto
// de interfaz, cambia y se traduce, y una rama atada a el se rompe por un
// motivo que no es el comportamiento.
const CODIGO_YA_RESPONDIDO = 'LD004'

async function cambiarEstadoLead(id: string, estado: 'aceptado' | 'descartado') {
  const { data, error } = await (await crearClienteServidor())
    .from('leads').update({ estado }).eq('id', id).select('id')

  // .select() encadenado a proposito: un UPDATE de PostgREST que afecta CERO
  // filas devuelve error null. Sin el, un lead ajeno o ya respondido pasaria
  // por exito.
  if (error) {
    return { error: error.code === CODIGO_YA_RESPONDIDO ? MENSAJE_LEAD_YA_RESPONDIDO : MENSAJE_GENERICO }
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
