'use server'

import { after } from 'next/server'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { esquemaLead } from '@/lib/validacion/esquemas'
import {
  MENSAJE_GENERICO, MENSAJE_LEAD_DUPLICADO,
  MENSAJE_LEAD_NO_PUBLICADA, MENSAJE_LEAD_PROPIA,
} from '@/lib/errores/mapear'
import { procesarLeadIndividual } from '@/lib/ia/despachador'

export interface EstadoLead {
  error?: string
  enviado?: boolean
}

const CODIGO_NO_PUBLICADA = 'LD002'
const CODIGO_PROPIA = 'LD003'
const CODIGO_DUPLICADO = '23505'

export async function enviarLead(_previo: EstadoLead, formData: FormData): Promise<EstadoLead> {
  const analisis = esquemaLead.safeParse({
    mensaje: formData.get('mensaje'),
    telefono: formData.get('telefono'),
  })
  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? MENSAJE_GENERICO }
  }

  const propiedadId = formData.get('propiedad_id')
  if (typeof propiedadId !== 'string') return { error: MENSAJE_GENERICO }

  const { data, error } = await (await crearClienteServidor()).rpc('crear_lead', {
    p_propiedad_id: propiedadId,
    p_telefono: analisis.data.telefono,
    p_mensaje: analisis.data.mensaje,
  })

  if (!error) {
    const leadId = data as string | undefined
    if (leadId) {
      try {
        after(async () => {
          try {
            await procesarLeadIndividual(leadId)
          } catch (err) {
            console.error('Error al despachar atencion automatica de lead:', err)
          }
        })
      } catch {
        // En entornos de prueba fuera del contexto de solicitud de Next.js
      }
    }
    return { enviado: true }
  }

  if (error.code === CODIGO_DUPLICADO) return { error: MENSAJE_LEAD_DUPLICADO }
  if (error.code === CODIGO_NO_PUBLICADA) return { error: MENSAJE_LEAD_NO_PUBLICADA }
  if (error.code === CODIGO_PROPIA) return { error: MENSAJE_LEAD_PROPIA }
  return { error: MENSAJE_GENERICO }
}
