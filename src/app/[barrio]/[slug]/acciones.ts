'use server'

import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { esquemaLead } from '@/lib/validacion/esquemas'
import {
  MENSAJE_GENERICO, MENSAJE_LEAD_DUPLICADO,
  MENSAJE_LEAD_NO_PUBLICADA, MENSAJE_LEAD_PROPIA,
} from '@/lib/errores/mapear'

export interface EstadoLead {
  error?: string
  enviado?: boolean
}

// SQLSTATE que levanta public.crear_lead(). Ver
// supabase/migrations/20260911000400_crear_lead.sql
//
// LD001/LD002/LD003 son codigos propios de esa funcion (clase LD, fuera del
// rango que el estandar SQL se reserva) -- uno por causa, a proposito: antes
// "no publicada" y "propia propiedad" compartian P0001, lo que hubiera
// obligado a distinguirlas por el TEXTO del mensaje, fragil ante cualquier
// reescritura o traduccion. LD001 (la propiedad no existe) no se usa aqui:
// esta accion nunca manda un propiedad_id que la ficha no le haya dado.
// Sin `export`: un fichero 'use server' solo puede exportar funciones async
// (Next lo hace cumplir en build -- Turbopack lo rechaza si no). La prueba
// unitaria repite estos mismos valores literales, con una nota que lo dice.
const CODIGO_NO_PUBLICADA = 'LD002'
const CODIGO_PROPIA = 'LD003'
// Este SI viene de otro sitio: sale del UNIQUE de la tabla `leads`
// (leads_uno_por_comprador_y_propiedad), no de la funcion.
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

  const { error } = await (await crearClienteServidor()).rpc('crear_lead', {
    p_propiedad_id: propiedadId,
    p_telefono: analisis.data.telefono,
    p_mensaje: analisis.data.mensaje,
  })

  if (!error) return { enviado: true }

  // Las tres causas se distinguen AQUI y no en mapearError: crear_lead levanta
  // codigos distintos a proposito, y mapear a ciegas un codigo compartido por
  // dos comprobaciones es un defecto que este proyecto ya cometio.
  if (error.code === CODIGO_DUPLICADO) return { error: MENSAJE_LEAD_DUPLICADO }
  if (error.code === CODIGO_NO_PUBLICADA) return { error: MENSAJE_LEAD_NO_PUBLICADA }
  if (error.code === CODIGO_PROPIA) return { error: MENSAJE_LEAD_PROPIA }
  return { error: MENSAJE_GENERICO }
}
