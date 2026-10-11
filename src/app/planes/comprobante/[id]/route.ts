import { z } from 'zod'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'

export async function GET(_peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionActual()
  if (!sesion.idUsuario) return new Response(null, { status: 401 })
  const id = z.string().uuid().safeParse((await params).id)
  if (!id.success) return new Response(null, { status: 404 })
  const cliente = await crearClienteServidor()
  const { data, error } = await cliente.from('ordenes_plan').select('id,plan,periodo,centavos,ambiente,transaccion_id,pagado_en,requiere_revision').eq('id', id.data).eq('usuario_id', sesion.idUsuario).eq('estado', 'APPROVED').maybeSingle()
  if (error) return new Response(null, { status: 503 })
  if (!data) return new Response(null, { status: 404 })
  const texto = ['PORTAL INMOBILIARIO', data.ambiente === 'test' ? 'COMPROBANTE DE PRUEBA — SIN VALOR COMERCIAL' : 'COMPROBANTE DE PAGO', `Orden: ${data.id}`, `Transacción Wompi: ${data.transaccion_id}`, `Plan: ${data.plan}`, `Periodo: ${data.periodo}`, `Total COP: ${Number(data.centavos) / 100}`, `Confirmado: ${data.pagado_en}`, '', data.requiere_revision ? 'Activación pendiente de revisión; se conserva el plan anterior.' : '', 'Este comprobante no es una factura electrónica.'].join('\n')
  return new Response(texto, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="comprobante-${id.data}.txt"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}