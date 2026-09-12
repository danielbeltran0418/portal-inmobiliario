import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { filasDelPanel, type PropiedadCruda } from '@/lib/propiedades/panel'
import { contarLeadsNuevos } from '@/lib/leads/consultas'

export const metadata: Metadata = {
  title: 'Mis propiedades | Portal Inmobiliario',
  description: 'Publica y administra tus propiedades en venta y arriendo.',
  // Privada: no se indexa, y ademas no se sigue ningun enlace desde ella.
  robots: { index: false, follow: false },
}

const CLASE_BOTON_PRIMARIO =
  'inline-flex items-center justify-center rounded bg-foreground px-5 py-2.5 ' +
  'text-sm font-medium text-background hover:opacity-90'

/**
 * Listado de propiedades del vendedor: la primera pantalla que ve al entrar.
 *
 * El .eq('vendedor_id', ...) de abajo NO es redundante: 20260827000600_propiedades.sql
 * define DOS politicas SELECT permisivas para `authenticated` sobre esta tabla
 * (propiedades_lectura_dueno: vendedor_id = auth.uid(); propiedades_lectura_publica:
 * estado = 'publicada', que tambien alcanza a authenticated). Postgres combina
 * politicas permisivas del mismo comando con OR, asi que sin este filtro un
 * vendedor autenticado recibe sus propias filas MAS todas las propiedades
 * publicadas de cualquier otro vendedor -- "mis propiedades" dejaria de
 * significar "las mias" (visto en vivo: ver tests/rls/propiedades.test.ts,
 * "SIN filtro explicito"). La consulta trae `imagenes_propiedad(id)` --
 * relacion anidada de PostgREST, no una columna -- solo para poder contar sus
 * imagenes, que es lo que pide faltantesParaPublicar via filasDelPanel.
 */
export default async function PaginaPanelVendedor() {
  const supabase = await crearClienteServidor()

  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario.user) redirect('/login')

  const { data } = await supabase
    .from('propiedades')
    .select('id, titulo, estado, precio, barrio_id, descripcion, imagenes_propiedad(id)')
    .eq('vendedor_id', usuario.user.id)
    .order('actualizado_en', { ascending: false })

  const filas = filasDelPanel((data ?? []) as unknown as PropiedadCruda[])
  const nuevos = await contarLeadsNuevos(supabase)

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Mis propiedades</h1>
        <div className="flex items-center gap-4">
          <Link href="/panel/leads" className="text-marca hover:underline">
            Mensajes recibidos{nuevos > 0 ? ` (${nuevos})` : ''}
          </Link>
          <Link href="/panel/propiedades/nueva" className={CLASE_BOTON_PRIMARIO}>
            Publicar una propiedad
          </Link>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="mt-8 opacity-80">
          Todavía no has publicado ninguna propiedad. Usa el botón «Publicar una propiedad»
          para crear tu primer borrador.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {filas.map((fila) => (
            <li
              key={fila.id}
              className="rounded border border-black/10 p-4 dark:border-white/15"
            >
              {/* Correccion del hallazgo Critico de la revision final de rama: esta era
                  la UNICA fila sin forma de volver a la propiedad. La Task 11 (este
                  listado) y la Task 12 (la pantalla de edicion en
                  /panel/propiedades/[id]) se dieron por completas cada una por su lado,
                  pero ningun enlace las conectaba -- una propiedad solo era editable
                  durante la misma visita que la creaba (el redirect de crearBorrador ya
                  deja al vendedor ahi dentro). fila.id ya viajaba en FilaPanel: bastaba
                  usarlo. */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-medium">
                  <Link href={`/panel/propiedades/${fila.id}`} className="hover:underline">
                    {fila.titulo}
                  </Link>
                </h2>
                <span className="text-sm opacity-70">{fila.estadoTexto}</span>
              </div>
              <p className="mt-1 opacity-80">{fila.precioTexto}</p>

              {fila.faltantes.length > 0 && (
                <div className="mt-3 text-sm">
                  <p className="font-medium">Para publicarla falta:</p>
                  <ul className="mt-1 list-disc pl-5 opacity-80">
                    {fila.faltantes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
