import type { Metadata } from 'next'
import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { filasDelPanel, type PropiedadCruda } from '@/lib/propiedades/panel'

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
 * RLS (propiedades_lectura_dueno, ver 20260827000600_propiedades.sql) ya
 * filtra por dueño: un .eq('vendedor_id', ...) aqui seria redundante. La
 * consulta trae `imagenes_propiedad(id)` -- relacion anidada de PostgREST,
 * no una columna -- solo para poder contar sus imagenes, que es lo que pide
 * faltantesParaPublicar via filasDelPanel.
 */
export default async function PaginaPanelVendedor() {
  const supabase = await crearClienteServidor()

  const { data } = await supabase
    .from('propiedades')
    .select('id, titulo, estado, precio, barrio_id, descripcion, imagenes_propiedad(id)')
    .order('actualizado_en', { ascending: false })

  const filas = filasDelPanel((data ?? []) as unknown as PropiedadCruda[])

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Mis propiedades</h1>
        <Link href="/panel/propiedades/nueva" className={CLASE_BOTON_PRIMARIO}>
          Publicar una propiedad
        </Link>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-medium">{fila.titulo}</h2>
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
