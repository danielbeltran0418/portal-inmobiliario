import Image from 'next/image'

interface Foto {
  id: string
  alt_text: string
  orden: number
}

const MARCO = 'relative overflow-hidden rounded-2xl border border-linea bg-superficie-alt'

function Imagen({ foto, titulo, principal }: { foto: Foto; titulo: string; principal?: boolean }) {
  return (
    <Image
      src={`/imagen/${foto.id}`}
      alt={foto.alt_text || titulo}
      width={principal ? 1200 : 600}
      height={principal ? 900 : 450}
      unoptimized
      // La primera foto es lo que pinta el LCP de la ficha: se pide ya y con
      // prioridad. El resto sigue el diferido por defecto de next/image.
      {...(principal ? { loading: 'eager' as const, fetchPriority: 'high' as const } : {})}
      className="h-full w-full object-cover"
    />
  )
}

/**
 * Galeria de la ficha: una foto principal grande y hasta cuatro laterales; si
 * hay mas, el resto queda tras un desplegable (<details>, sin JavaScript) para
 * que la pagina no cargue ni alargue con una veintena de fotos.
 */
export function GaleriaFicha({ fotos, titulo }: { fotos: Foto[]; titulo: string }) {
  const ordenadas = [...fotos].sort((a, b) => a.orden - b.orden)

  if (ordenadas.length === 0) {
    return (
      <div className="flex aspect-[16/7] items-center justify-center rounded-2xl border border-linea bg-superficie-alt text-sm text-tinta-tenue">
        Sin fotografías
      </div>
    )
  }

  const [principal, ...resto] = ordenadas
  const laterales = resto.slice(0, 4)
  const extra = resto.slice(4)

  return (
    <div>
      <div
        className={
          laterales.length === 0
            ? 'grid'
            : 'grid grid-cols-2 gap-3 lg:h-[26rem] lg:grid-cols-4 lg:grid-rows-2'
        }
      >
        <div
          className={`${MARCO} ${
            laterales.length === 0
              ? 'aspect-[16/9]'
              : 'col-span-2 aspect-[4/3] lg:row-span-2 lg:aspect-auto'
          }`}
        >
          <Imagen foto={principal} titulo={titulo} principal />
        </div>
        {laterales.map((foto) => (
          <div key={foto.id} className={`${MARCO} aspect-[4/3] lg:aspect-auto`}>
            <Imagen foto={foto} titulo={titulo} />
          </div>
        ))}
      </div>

      {extra.length > 0 && (
        <details className="mt-3">
          <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-linea bg-superficie px-4 text-sm font-semibold text-tinta transition-colors hover:border-marca hover:text-marca">
            {`Ver las ${ordenadas.length} fotos`}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {extra.map((foto) => (
              <div key={foto.id} className={`${MARCO} aspect-[4/3]`}>
                <Imagen foto={foto} titulo={titulo} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
