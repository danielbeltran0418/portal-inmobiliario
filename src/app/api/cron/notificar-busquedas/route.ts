import { NextRequest, NextResponse } from 'next/server';
import { procesarNotificacionesBusquedas } from '@/lib/notificaciones/despachador';
import { cronAutorizado } from '@/lib/seguridad/secreto-cron';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!cronAutorizado(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return new NextResponse('RESEND_API_KEY no configurada', { status: 500 });
  }

  if (!process.env.RESEND_FROM) {
    return new NextResponse('RESEND_FROM no configurada', { status: 500 });
  }

  try {
    const resultado = await procesarNotificacionesBusquedas();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    console.error('[Notificaciones] Fallo critico al procesar notificaciones de busquedas:', error);
    return new NextResponse('Error interno al procesar notificaciones', { status: 500 });
  }
}
