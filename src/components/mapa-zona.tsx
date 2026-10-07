import { ExternalLink } from 'lucide-react'
import { ALTO_MAPA, ANCHO_MAPA } from '@/lib/mapa/coordenadas'
import { enlaceGoogleMaps } from '@/lib/mapa/google'

/**
 * Mapa de la zona aproximada con Google Maps. La imagen la sirve
 * /imagen/zona/[id] (la clave de Google se queda en el servidor) y el enlace
 * abre Google Maps en el centro APROXIMADO, nunca en el punto del inmueble.
 */
export function MapaZona({
  propiedadId,
  zona,
  barrio,
}: {
  propiedadId: string
  zona: { latitud: number; longitud: number }
  barrio: string
}) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-linea">
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen de nuestro propio route handler, ya dimensionada y cacheada */}
      <img
        src={`/imagen/zona/${propiedadId}`}
        alt={`Mapa de la zona aproximada del inmueble en ${barrio}`}
        width={ANCHO_MAPA}
        height={ALTO_MAPA}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full bg-superficie-alt"
      />
      <figcaption className="flex flex-wrap items-center justify-between gap-2 bg-superficie px-4 py-2.5 text-xs text-tinta-suave">
        <span>Zona aproximada en {barrio}. La dirección exacta se comparte 2 horas antes de la visita agendada.</span>
        <a
          href={enlaceGoogleMaps(zona)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-marca hover:underline"
        >
          Ver la zona en Google Maps
          <ExternalLink aria-hidden="true" className="h-3 w-3" />
        </a>
      </figcaption>
    </figure>
  )
}
