import { NextRequest, NextResponse } from 'next/server';
import { procesarLeadsNuevos } from '@/lib/ia/despachador';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const procesados = await procesarLeadsNuevos();
  return NextResponse.json({ ok: true, procesados });
}
