import { NextRequest, NextResponse } from 'next/server';
import { procesarLeadsNuevos } from '@/lib/ia/despachador';
import { cronAutorizado } from '@/lib/seguridad/secreto-cron';

export async function GET(req: NextRequest) {
  if (!cronAutorizado(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const procesados = await procesarLeadsNuevos();
  return NextResponse.json({ ok: true, procesados });
}
