import Link from 'next/link'
import { crearClienteAdmin } from '@/lib/supabase/cliente-admin'
import { accionCambiarEstadoBarrio } from './acciones'
import { FormularioBarrio } from './formulario'

export const dynamic = 'force-dynamic'

interface FilaBarrio {
  id: string
  nombre: string
  slug: string
  ciudad: string
  ciudad_slug: string
  activo: boolean
}

/**
 * Barrios y ciudades del portal. Antes solo se podian agregar con una
 * migracion. El layout de /control ya exige super admin; las acciones lo
 * vuelven a comprobar. Se lee con service_role porque RLS solo deja ver los
 * barrios ACTIVOS, y aqui hacen falta tambien los desactivados.
 */
export default async function PaginaBarrios() {
  const { data, error } = await crearClienteAdmin()
    .from('barrios')
    .select('id, nombre, slug, ciudad, ciudad_slug, activo')
    .order('ciudad')
    .order('nombre')
  const filas = (data ?? []) as FilaBarrio[]

  const porCiudad = new Map<string, { nombre: string; slug: string; barrios: FilaBarrio[] }>()
  for (const b of filas) {
    const grupo = porCiudad.get(b.ciudad_slug) ?? { nombre: b.ciudad, slug: b.ciudad_slug, barrios: [] }
    grupo.barrios.push(b)
    porCiudad.set(b.ciudad_slug, grupo)
  }
  const ciudades = [...porCiudad.values()]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-titulo text-2xl font-bold tracking-tight text-tinta">Barrios y ciudades</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          {filas.length} barrios en {ciudades.length} {ciudades.length === 1 ? 'ciudad' : 'ciudades'}. Un barrio
          desactivado desaparece del catálogo, pero no se borra ni pierde sus propiedades.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-peligro-suave p-4 text-sm text-peligro">No se pudieron cargar los barrios.</p>
      )}

      <FormularioBarrio ciudades={ciudades.map((c) => c.nombre)} />

      {ciudades.map((ciudad) => (
        <section key={ciudad.slug} className="overflow-hidden rounded-xl border border-linea bg-superficie shadow-xs">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-linea bg-superficie-alt px-4 py-3">
            <h2 className="text-sm font-bold text-tinta">
              {ciudad.nombre} <span className="font-normal text-tinta-tenue">· {ciudad.barrios.length}</span>
            </h2>
            <Link href={`/ciudad/${ciudad.slug}`} className="text-xs font-semibold text-marca hover:underline">
              Ver /ciudad/{ciudad.slug}
            </Link>
          </header>
          <ul className="divide-y divide-linea-suave">
            {ciudad.barrios.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className={b.activo ? 'text-tinta' : 'text-tinta-tenue line-through'}>
                  {b.nombre} <span className="cifra text-xs text-tinta-tenue">/{b.slug}</span>
                </span>
                <form action={accionCambiarEstadoBarrio}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="activo" value={b.activo ? 'false' : 'true'} />
                  <button
                    type="submit"
                    className={`cursor-pointer text-xs font-semibold hover:underline ${b.activo ? 'text-peligro' : 'text-marca'}`}
                  >
                    {b.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
