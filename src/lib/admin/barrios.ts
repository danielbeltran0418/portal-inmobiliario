import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { slugDeTexto } from '@/lib/catalogo/ciudades'
import { RUTAS_RESERVADAS } from '@/lib/catalogo/rutas'

export const esquemaBarrio = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre del barrio').max(80, 'Máximo 80 caracteres'),
  ciudad: z.string().trim().min(2, 'Escribe la ciudad').max(80, 'Máximo 80 caracteres'),
})

export type ResultadoBarrio = { ok: true; slug: string } | { ok: false; error: string }

/**
 * Slug (= URL /{slug}) para un barrio nuevo. El slug es unico en todo el pais:
 * si "el-prado" ya existe (otra ciudad) o choca con una ruta del portal, se le
 * agrega la ciudad ("el-prado-bucaramanga"), y si aun asi existe, un numero.
 */
export function proponerSlug(nombre: string, ciudad: string, existentes: ReadonlySet<string>): string {
  const reservadas = new Set<string>(RUTAS_RESERVADAS)
  const libre = (s: string) => s.length > 0 && !existentes.has(s) && !reservadas.has(s)
  const base = slugDeTexto(nombre).slice(0, 60)
  if (libre(base)) return base
  const conCiudad = `${base}-${slugDeTexto(ciudad)}`.slice(0, 76)
  if (libre(conCiudad)) return conCiudad
  for (let n = 2; ; n++) {
    const candidato = `${conCiudad}-${n}`
    if (libre(candidato)) return candidato
  }
}

/**
 * Alta de un barrio desde el panel de control. `admin` es el cliente con
 * service_role (authenticated no tiene INSERT sobre barrios); quien llama ya
 * verifico que el usuario es super admin. Deja evento de auditoria.
 */
export async function crearBarrio(
  admin: SupabaseClient,
  entrada: { nombre: unknown; ciudad: unknown },
  adminId: string,
): Promise<ResultadoBarrio> {
  const analisis = esquemaBarrio.safeParse(entrada)
  if (!analisis.success) return { ok: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' }
  const { nombre, ciudad } = analisis.data

  const { data: filas, error: errorLectura } = await admin.from('barrios').select('slug')
  if (errorLectura) return { ok: false, error: 'No se pudieron leer los barrios existentes.' }
  const slug = proponerSlug(nombre, ciudad, new Set((filas ?? []).map((f: { slug: string }) => f.slug)))

  const { data, error } = await admin.from('barrios').insert({ nombre, ciudad, slug }).select('id').single()
  if (error || !data) {
    // 23505: otro admin creo el mismo slug entre la lectura y el insert.
    return { ok: false, error: error?.code === '23505' ? 'Ese barrio ya existe. Recarga la página.' : 'No se pudo crear el barrio.' }
  }

  await admin.rpc('registrar_evento_auditoria', {
    p_accion: 'barrio_creado',
    p_entidad: 'barrios',
    p_entidad_id: data.id,
    p_actor_id: adminId,
    p_metadatos: { nombre, ciudad, slug },
    p_ip: null,
  })
  return { ok: true, slug }
}

/** Activar o desactivar: un barrio inactivo desaparece del catalogo, no se borra. */
export async function cambiarEstadoBarrio(
  admin: SupabaseClient,
  barrioId: string,
  activo: boolean,
  adminId: string,
): Promise<ResultadoBarrio> {
  const { data, error } = await admin.from('barrios').update({ activo }).eq('id', barrioId).select('slug').single()
  if (error || !data) return { ok: false, error: 'No se pudo actualizar el barrio.' }
  await admin.rpc('registrar_evento_auditoria', {
    p_accion: activo ? 'barrio_activado' : 'barrio_desactivado',
    p_entidad: 'barrios',
    p_entidad_id: barrioId,
    p_actor_id: adminId,
    p_metadatos: { slug: data.slug },
    p_ip: null,
  })
  return { ok: true, slug: data.slug }
}
