import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { firmarImagenes } from '@/lib/imagenes/firmar'
import { BotonModeracion } from '@/components/admin/BotonModeracion'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function PaginaInspeccionPropiedad({ params }: Props) {
  const { id } = await params
  const supabase = await crearClienteServidor()

  const { data: prop, error } = await supabase
    .from('propiedades')
    .select(`
      id,
      titulo,
      descripcion,
      slug,
      precio,
      operacion,
      tipo_inmueble,
      estado,
      destacada,
      creado_en,
      actualizado_en,
      vendedor:vendedor_id (id, nombre, telefono),
      barrios:barrio_id (nombre),
      imagenes:imagenes_propiedad (id, ruta_storage, alt_text, orden)
    `)
    .eq('id', id)
    .single()

  if (error || !prop) {
    notFound()
  }

  // Firmar URLs de imágenes
  const rutas = (prop.imagenes || []).map((img: { ruta_storage: string }) => img.ruta_storage)
  const mapaFirmadas = await firmarImagenes(rutas)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-linea pb-4">
        <div>
          <Link
            href="/control/moderacion"
            className="text-xs font-semibold text-marca hover:underline"
          >
            &larr; Volver a Moderación
          </Link>
          <h1 className="mt-1 font-titulo text-2xl font-bold tracking-tight text-tinta">
            {prop.titulo}
          </h1>
          <p className="text-xs text-tinta-suave">
            ID: <span className="font-mono">{prop.id}</span> • Slug:{' '}
            <span className="font-mono">{prop.slug}</span>
          </p>
        </div>
        <div>
          <BotonModeracion propiedadId={prop.id} estadoActual={prop.estado} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Columna Izquierda: Datos del Inmueble */}
        <div className="space-y-6 md:col-span-2">
          <div className="rounded-xl border border-linea bg-superficie p-6 shadow-xs">
            <h2 className="text-base font-bold text-tinta">Detalles de la Publicación</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <span className="text-xs text-tinta-tenue">Estado</span>
                <p className="font-medium text-tinta">{prop.estado}</p>
              </div>
              <div>
                <span className="text-xs text-tinta-tenue">Operación</span>
                <p className="font-medium text-tinta capitalize">{prop.operacion}</p>
              </div>
              <div>
                <span className="text-xs text-tinta-tenue">Tipo</span>
                <p className="font-medium text-tinta capitalize">{prop.tipo_inmueble}</p>
              </div>
              <div>
                <span className="text-xs text-tinta-tenue">Precio</span>
                <p className="font-medium text-tinta">
                  {prop.precio ? `$${prop.precio.toLocaleString('es-CO')}` : 'Sin precio'}
                </p>
              </div>
              <div>
                <span className="text-xs text-tinta-tenue">Barrio</span>
                <p className="font-medium text-tinta">{prop.barrios?.nombre ?? 'Sin barrio'}</p>
              </div>
              <div>
                <span className="text-xs text-tinta-tenue">Destacada</span>
                <p className="font-medium text-tinta">{prop.destacada ? 'Sí' : 'No'}</p>
              </div>
            </div>

            <div className="mt-6 border-t border-linea-suave pt-4">
              <span className="text-xs text-tinta-tenue">Descripción</span>
              <p className="mt-1 whitespace-pre-wrap text-sm text-tinta-suave">
                {prop.descripcion || 'Sin descripción'}
              </p>
            </div>
          </div>

          {/* Galería de Fotos */}
          <div className="rounded-xl border border-linea bg-superficie p-6 shadow-xs">
            <h2 className="text-base font-bold text-tinta">
              Fotografías ({prop.imagenes?.length ?? 0})
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {(prop.imagenes || []).map((img: { id: string; ruta_storage: string; alt_text: string }) => {
                const url = mapaFirmadas.get(img.ruta_storage)
                return (
                  <div
                    key={img.id}
                    className="relative aspect-4/3 overflow-hidden rounded-lg border border-linea bg-superficie-alt"
                  >
                    {url ? (
                      <Image
                        src={url}
                        alt={img.alt_text || 'Foto inmueble'}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-tinta-tenue">
                        Sin vista previa
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Columna Derecha: Datos del Vendedor */}
        <div className="space-y-6">
          <div className="rounded-xl border border-linea bg-superficie p-6 shadow-xs">
            <h2 className="text-base font-bold text-tinta">Vendedor Propietario</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <span className="text-xs text-tinta-tenue">Nombre</span>
                <p className="font-medium text-tinta">{prop.vendedor?.nombre ?? 'Sin nombre'}</p>
              </div>
              <div>
                <span className="text-xs text-tinta-tenue">Teléfono</span>
                <p className="font-medium text-tinta">{prop.vendedor?.telefono ?? 'Sin teléfono'}</p>
              </div>
              <div>
                <span className="text-xs text-tinta-tenue">ID Vendedor</span>
                <p className="font-mono text-xs text-tinta-suave">{prop.vendedor?.id ?? 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
