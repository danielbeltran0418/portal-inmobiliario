import { z } from 'zod'
import { NextResponse } from 'next/server'
import { crearClientePublico } from '@/lib/supabase/cliente-publico'

export async function GET(peticion: Request) {
  const parametros = new URL(peticion.url).searchParams
  const q = parametros.get('q')?.trim() ?? ''
  if (parametros.getAll('q').length !== 1 || !z.string().regex(/^[\p{L}\p{N} ]{2,60}$/u).safeParse(q).success) return NextResponse.json({ ubicaciones: [] }, { status: 400 })
  const filtro = `nombre.ilike.*${q}*,ciudad.ilike.*${q}*${/^\d{6}$/.test(q) ? `,codigo_postal.eq.${q}` : ''}`
  const { data, error } = await crearClientePublico().from('barrios').select('nombre,slug,ciudad,codigo_postal').eq('activo', true).or(filtro).order('nombre').limit(8)
  if (error) return NextResponse.json({ ubicaciones: [] }, { status: 503 })
  return NextResponse.json({ ubicaciones: data ?? [] }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } })
}