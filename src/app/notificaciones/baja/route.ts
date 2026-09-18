import { NextRequest, NextResponse } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return new NextResponse('Falta el parametro token', { status: 400 });
  }

  const admin = crearClienteAdmin();
  const { error } = await admin.from('busquedas_guardadas').update({ notificaciones_activas: false }).eq('token_baja', token);
  if (error) {
    console.error('[Notificaciones] Error al desactivar busqueda por token_baja:', error);
  }

  return NextResponse.redirect(new URL('/notificaciones/baja/confirmado', req.url));
}
