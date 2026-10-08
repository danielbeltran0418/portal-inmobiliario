import { NextResponse } from 'next/server'
import { accesoAdmin } from '@/lib/auth/admin'
import { aCsv, filasModeracionCsv, type PropiedadModeracionCsv } from '@/lib/admin/csv'

/** Tope de filas: suficiente para el volumen del portal y acota la respuesta. */
const MAXIMO_FILAS = 5000

/**
 * "Exportar CSV" del listado de moderacion (diseño de Figma Make).
 *
 * El layout de /control NO protege un route handler: los layouts solo
 * envuelven paginas. El rol se comprueba aqui otra vez, ademas del proxy.
 * Es dinamica por leer cookies: nunca se prerenderiza.
 */
export async function GET() {
  const acceso = await accesoAdmin()
  if (acceso.estado === 'sin_sesion') return new NextResponse('No autenticado', { status: 401 })
  if (acceso.estado !== 'ok') return new NextResponse('Acceso no autorizado', { status: 403 })
  const supabase = acceso.cliente

  const { data, error } = await supabase
    .from('propiedades')
    .select(`
      id,
      titulo,
      operacion,
      estado,
      destacada,
      precio,
      creado_en,
      vendedor:vendedor_id (nombre),
      barrios:barrio_id (nombre)
    `)
    .order('creado_en', { ascending: false })
    .limit(MAXIMO_FILAS)

  if (error || !data) {
    console.error('[exportar-csv] no se pudo leer propiedades:', error)
    return new NextResponse('No se pudo generar el CSV', { status: 500 })
  }

  const { cabecera, filas } = filasModeracionCsv(data as unknown as PropiedadModeracionCsv[])
  // BOM: sin el, Excel abre el UTF-8 como Latin-1 y rompe las tildes.
  const cuerpo = '﻿' + aCsv(cabecera, filas)
  const fecha = new Date().toISOString().slice(0, 10)

  return new NextResponse(cuerpo, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="moderacion-${fecha}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
