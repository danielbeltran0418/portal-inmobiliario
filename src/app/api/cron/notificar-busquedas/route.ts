import { NextRequest, NextResponse } from 'next/server';
import { procesarNotificacionesBusquedas } from '@/lib/notificaciones/despachador';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return new NextResponse('RESEND_API_KEY no configurada', { status: 500 });
  }

  const resultado = await procesarNotificacionesBusquedas();
  return NextResponse.json({ ok: true, ...resultado });
}
