import { NextResponse } from 'next/server'
import { configuracionWompi } from '@/lib/planes/configuracion'
import { esquemaEventoWompi, esquemaRespuestaTransaccion, verificarEvento } from '@/lib/planes/wompi'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'

export async function POST(peticion: Request) {
  const configuracion = configuracionWompi()
  if (!configuracion) return new NextResponse(null, { status: 503 })
  const lector = peticion.body?.getReader()
  if (!lector) return new NextResponse(null, { status: 400 })
  const trozos: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const trozo = await lector.read()
      if (trozo.done) break
      bytes += trozo.value.byteLength
      if (bytes > 32_768) { await lector.cancel(); return new NextResponse(null, { status: 413 }) }
      trozos.push(trozo.value)
    }
  } catch { return new NextResponse(null, { status: 400 }) }
  finally { lector.releaseLock() }
  let crudo: unknown
  try { crudo = JSON.parse(Buffer.concat(trozos).toString('utf8')) } catch { return new NextResponse(null, { status: 400 }) }
  const analisis = esquemaEventoWompi.safeParse(crudo)
  if (!analisis.success || !verificarEvento(analisis.data, configuracion.eventos) || analisis.data.environment !== configuracion.ambiente) return new NextResponse(null, { status: 401 })
  try {
    // La firma estándar no cubre reference/currency: obtenerlos del API fijo evita reasignar un pago firmado a otra orden.
    const respuesta = await fetch(`${configuracion.api}/transactions/${encodeURIComponent(analisis.data.data.transaction.id)}`, { headers: { Authorization: `Bearer ${configuracion.publica}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) })
    if (!respuesta.ok) return new NextResponse(null, { status: 502 })
    const verificada = esquemaRespuestaTransaccion.safeParse(await respuesta.json())
    if (!verificada.success) return new NextResponse(null, { status: 502 })
    const tx = verificada.data.data
    if (tx.id !== analisis.data.data.transaction.id || tx.amount_in_cents !== analisis.data.data.transaction.amount_in_cents) return new NextResponse(null, { status: 401 })
    const { data, error } = await crearClienteAdmin().rpc('confirmar_orden_plan', { p_id: tx.reference, p_transaccion: tx.id, p_centavos: tx.amount_in_cents, p_ambiente: configuracion.ambiente, p_estado: tx.status })
    if (error) return new NextResponse(null, { status: 500 })
    if (!data) return new NextResponse(null, { status: 409 })
    return new NextResponse(null, { status: 200 })
  } catch { return new NextResponse(null, { status: 502 }) }
}