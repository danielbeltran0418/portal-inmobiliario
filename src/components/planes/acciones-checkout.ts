'use server'

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { sesionActual } from '@/lib/auth/sesion'
import { rolDesdeToken } from '@/lib/auth/roles'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
import { configuracionWompi } from '@/lib/planes/configuracion'
import { precioConfigurado } from '@/lib/planes/catalogo'
import { urlCheckout } from '@/lib/planes/wompi'
import { urlPublica } from '@/lib/catalogo/seo'

export interface EstadoCheckout { error?: string; url?: string; orden?: string }
export async function prepararCheckout(_estado: EstadoCheckout, formulario: FormData): Promise<EstadoCheckout> {
  const datos = z.object({ plan: z.enum(['destacado','pro']), periodo: z.enum(['mensual','anual']) }).safeParse({ plan: formulario.get('plan'), periodo: formulario.get('periodo') })
  if (!datos.success) return { error: 'Selecciona un plan y un periodo válidos.' }
  const sesion = await sesionActual()
  if (!sesion.idUsuario || rolDesdeToken(sesion.accessToken ?? '') !== 'vendedor') return { error: 'Entra con tu cuenta de propietario o agente para contratar un plan.' }
  const configuracion = configuracionWompi()
  const precio = precioConfigurado(process.env[`PLAN_${datos.data.plan.toUpperCase()}_${datos.data.periodo.toUpperCase()}_COP`])
  if (!configuracion || precio === null) return { error: 'Este plan aún no está disponible para contratar.' }
  const admin = crearClienteAdmin()
  const { data: comercial, error: errorComercial } = await admin.from('configuracion_comercial').select('planes_activos').eq('singleton', true).maybeSingle()
  if (errorComercial || !comercial?.planes_activos) return { error: 'Los planes aún no están disponibles para contratar.' }
  const { count, error: errorLimite } = await admin.from('ordenes_plan').select('id', { count: 'exact', head: true }).eq('usuario_id', sesion.idUsuario).gt('creado_en', new Date(Date.now() - 30 * 60_000).toISOString())
  if (errorLimite || count === null || count >= 5) return { error: 'Espera unos minutos antes de preparar otro pago.' }
  const { data: vigente, error: errorVigencia } = await admin.from('suscripciones_plan').select('plan').eq('usuario_id', sesion.idUsuario).gt('vigente_hasta', new Date().toISOString()).maybeSingle()
  if (errorVigencia) return { error: 'No pudimos comprobar tu plan actual.' }
  if (vigente && vigente.plan !== datos.data.plan) return { error: 'Espera a que termine tu plan actual para cambiar de plan. Puedes renovarlo ahora.' }
  if (datos.data.plan === 'destacado') {
    const { count: anuncios, error: errorAnuncios } = await admin.from('propiedades').select('id', { count: 'exact', head: true }).eq('vendedor_id', sesion.idUsuario).eq('estado', 'publicada').or('publicada_hasta.is.null,publicada_hasta.gt.' + new Date().toISOString())
    if (errorAnuncios || anuncios === null) return { error: 'No pudimos comprobar tus publicaciones.' }
    if (anuncios > 5) return { error: 'Destacado permite cinco publicaciones activas. Pausa las restantes o elige Pro.' }
  }
  const id = randomUUID()
  const vence = new Date(Date.now() + 30 * 60_000).toISOString()
  const { error } = await admin.from('ordenes_plan').insert({ id, usuario_id: sesion.idUsuario, plan: datos.data.plan, periodo: datos.data.periodo, centavos: precio * 100, ambiente: configuracion.ambiente, vence_en: vence })
  if (error) return { error: 'No pudimos preparar el pago. Inténtalo de nuevo.' }
  return { orden: id, url: urlCheckout(id, precio * 100, configuracion.publica, configuracion.integridad, urlPublica(`/planes/resultado?orden=${id}`), vence) }
}