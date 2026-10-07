import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Misma regla que public.slug_de_texto() (migracion 20261012000200): sin
 * tildes ni eñes, minusculas, y cualquier otra cosa a guiones simples. La base
 * calcula barrios.ciudad_slug con ella; aqui se usa para proponer el slug de
 * un barrio nuevo en el panel de control.
 */
export function slugDeTexto(texto: string): string {
  return texto
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface Ciudad {
  nombre: string
  slug: string
  barrios: number
}

/** Ciudades con al menos un barrio activo, de la que mas barrios tiene a la que menos. */
export async function listarCiudades(cliente: SupabaseClient): Promise<Ciudad[]> {
  const { data, error } = await cliente.from('barrios').select('ciudad,ciudad_slug').eq('activo', true)
  if (error) return []
  const porSlug = new Map<string, Ciudad>()
  for (const fila of (data ?? []) as { ciudad: string; ciudad_slug: string }[]) {
    const actual = porSlug.get(fila.ciudad_slug)
    if (actual) actual.barrios++
    else porSlug.set(fila.ciudad_slug, { nombre: fila.ciudad, slug: fila.ciudad_slug, barrios: 1 })
  }
  return [...porSlug.values()].sort((a, b) => b.barrios - a.barrios || a.nombre.localeCompare(b.nombre, 'es'))
}

export interface BarrioDeCiudad {
  id: string
  nombre: string
  slug: string
}

/** La ciudad por su slug con sus barrios activos, o null si no hay ninguno. */
export async function cargarCiudad(
  cliente: SupabaseClient,
  slug: string,
): Promise<{ nombre: string; slug: string; barrios: BarrioDeCiudad[] } | null> {
  if (slug.length > 80 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null
  const { data, error } = await cliente.from('barrios').select('id,nombre,slug,ciudad')
    .eq('ciudad_slug', slug).eq('activo', true).order('nombre')
  if (error) throw new Error('No se pudo cargar la ciudad')
  const filas = (data ?? []) as (BarrioDeCiudad & { ciudad: string })[]
  if (filas.length === 0) return null
  return { nombre: filas[0]!.ciudad, slug, barrios: filas.map(({ id, nombre, slug: s }) => ({ id, nombre, slug: s })) }
}
