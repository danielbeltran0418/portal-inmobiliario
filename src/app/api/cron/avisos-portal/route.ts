import { NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/seguridad/secreto-cron'
import { despacharAvisosPortal } from '@/lib/notificaciones/portal'
export const maxDuration = 60
export async function GET(peticion: Request) {
  if (!cronAutorizado(peticion.headers.get('authorization'), process.env.CRON_SECRET)) return new NextResponse(null, { status: 401 })
  try { return NextResponse.json(await despacharAvisosPortal()) }
  catch { return new NextResponse(null, { status: 503 }) }
}