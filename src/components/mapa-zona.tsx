import { ALTO_MAPA, ATRIBUCION_MAPA, PLANTILLA_TESELAS, teselasDeZona, urlTesela } from '@/lib/mapa/zona'

/**
 * Mapa estatico de la zona aproximada (ver src/lib/mapa/zona.ts). Se pinta en
 * el servidor: <img> de teselas centradas con calc(50% + dx) -- funciona con
 * cualquier ancho de pantalla -- y un circulo en el centro. Sin JavaScript.
 * Las teselas son decorativas (alt=""); la figura entera tiene su descripcion.
 */
export function MapaZona({ latitud, longitud, barrio }: { latitud: number; longitud: number; barrio: string }) {
  const { teselas, radioPx } = teselasDeZona(latitud, longitud)

  return (
    <figure className="overflow-hidden rounded-2xl border border-linea">
      <div
        role="img"
        aria-label={`Mapa de la zona aproximada del inmueble en ${barrio}`}
        className="relative w-full overflow-hidden bg-superficie-alt"
        style={{ height: ALTO_MAPA }}
      >
        {teselas.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element -- teselas externas de 256 px: next/image no aporta nada y exigiria configurar el dominio
          <img
            key={`${t.x}-${t.y}`}
            src={urlTesela(PLANTILLA_TESELAS, t)}
            alt=""
            width={256}
            height={256}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="pointer-events-none absolute max-w-none select-none"
            style={{ left: `calc(50% + ${t.dx}px)`, top: `calc(50% + ${t.dy}px)`, width: 256, height: 256 }}
          />
        ))}
        <span
          aria-hidden="true"
          className="absolute rounded-full border-2 border-marca bg-marca/20"
          style={{
            width: radioPx * 2,
            height: radioPx * 2,
            left: `calc(50% - ${radioPx}px)`,
            top: `calc(50% - ${radioPx}px)`,
          }}
        />
        <span className="absolute right-0 bottom-0 bg-superficie/85 px-1.5 py-0.5 text-[10px] text-tinta-suave">
          {ATRIBUCION_MAPA}
        </span>
      </div>
      <figcaption className="bg-superficie px-4 py-2.5 text-xs text-tinta-suave">
        Zona aproximada en {barrio}. La dirección exacta se comparte 2 horas antes de la visita agendada.
      </figcaption>
    </figure>
  )
}
