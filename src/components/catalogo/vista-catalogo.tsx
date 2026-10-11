'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Script from 'next/script'
import { precioPin, type PinCatalogo } from '@/lib/mapa/catalogo'

function resaltarMarcadores(registro: Map<string, { pin: google.maps.marker.AdvancedMarkerElement; enlace: HTMLAnchorElement }>, seleccionado: string | null) {
    for (const [id, { pin, enlace }] of registro) {
      enlace.className = `rounded-full border px-3 py-2 text-sm font-semibold shadow-md ${id === seleccionado ? 'border-marca bg-marca text-marca-contraste' : 'border-linea bg-superficie text-tinta'}`
      pin.zIndex = id === seleccionado ? 100 : 1
    }
}

export function VistaCatalogo({ children, pines, clave, mapaId, nonce }: { children: ReactNode; pines: PinCatalogo[]; clave: string | null; mapaId: string | null; nonce?: string }) {
  const [mostrarMapa, setMostrarMapa] = useState(false)
  const [cargado, setCargado] = useState(false)
  const [error, setError] = useState(false)
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const contenedor = useRef<HTMLDivElement>(null)
  const marcadores = useRef<Map<string, { pin: google.maps.marker.AdvancedMarkerElement; enlace: HTMLAnchorElement }>>(new Map())
  useEffect(() => {
    if (!cargado || !mostrarMapa || !contenedor.current || !mapaId || pines.length === 0) return
    let cancelado = false
    const creados: google.maps.marker.AdvancedMarkerElement[] = []
    async function preparar() {
      try {
        const { Map: Mapa } = await google.maps.importLibrary('maps') as google.maps.MapsLibrary
        const { AdvancedMarkerElement } = await google.maps.importLibrary('marker') as google.maps.MarkerLibrary
        if (cancelado || !contenedor.current) return
        const mapa = new Mapa(contenedor.current, { mapId: mapaId!, center: { lat: pines[0]!.latitud, lng: pines[0]!.longitud }, zoom: 13, streetViewControl: false, mapTypeControl: false, gestureHandling: 'cooperative' })
        const limites = new google.maps.LatLngBounds()
        for (const entrada of pines) {
          const enlace = document.createElement('a')
          enlace.href = entrada.ruta
          enlace.textContent = precioPin(entrada.precio, entrada.operacion)
          enlace.setAttribute('aria-label', `${entrada.titulo}, ${enlace.textContent}, zona aproximada`)
          enlace.className = 'rounded-full border border-linea bg-superficie px-3 py-2 text-sm font-semibold text-tinta shadow-md'
          enlace.addEventListener('focus', () => setSeleccion(entrada.id))
          const posicion = { lat: entrada.latitud, lng: entrada.longitud }
          const pin = new AdvancedMarkerElement({ map: mapa, position: posicion, content: enlace, title: entrada.titulo, collisionBehavior: google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY })
          creados.push(pin)
          marcadores.current.set(entrada.id, { pin, enlace })
          limites.extend(posicion)
        }
        if (pines.length > 1) { mapa.fitBounds(limites, 50); google.maps.event.addListenerOnce(mapa, 'idle', () => { if ((mapa.getZoom() ?? 0) > 15) mapa.setZoom(15) }) }
      } catch { if (!cancelado) setError(true) }
    }
    void preparar()
    const registro = marcadores.current
    return () => { cancelado = true; for (const pin of creados) pin.map = null; registro.clear() }
  }, [cargado, mostrarMapa, mapaId, pines])
  useEffect(() => {
    resaltarMarcadores(marcadores.current, seleccion)
  }, [seleccion])
  const disponible = Boolean(clave && mapaId && pines.length)
  return <div className="min-w-0 flex-1">
    {disponible && <button type="button" aria-pressed={mostrarMapa} onClick={() => setMostrarMapa(!mostrarMapa)} className="mb-5 min-h-11 rounded-full border border-linea bg-superficie px-5 text-sm font-semibold text-tinta">{mostrarMapa ? 'Solo listado' : 'Listado y mapa'}</button>}
    <div className={mostrarMapa ? 'grid gap-6 xl:grid-cols-2' : ''} onPointerOver={(evento) => { const tarjeta = (evento.target as HTMLElement).closest('[data-propiedad-id]'); if (tarjeta) setSeleccion(tarjeta.getAttribute('data-propiedad-id')) }} onFocusCapture={(evento) => { const tarjeta = evento.target.closest('[data-propiedad-id]'); if (tarjeta) setSeleccion(tarjeta.getAttribute('data-propiedad-id')) }}>
      <div role="region" aria-label="Listado de propiedades" className="min-w-0">{children}</div>
      {mostrarMapa && <section aria-label="Mapa de zonas aproximadas" className="sticky top-24 h-fit overflow-hidden rounded-2xl border border-linea bg-superficie">
        <div ref={contenedor} className="h-[480px] bg-superficie-alt" />
        {!cargado && !error && <p role="status" className="p-4 text-sm text-tinta-suave">Cargando mapa…</p>}
        {error && <p role="status" className="p-4 text-sm text-tinta-suave">El mapa no está disponible ahora. Puedes seguir explorando el listado.</p>}
        <p className="p-4 text-xs text-tinta-suave">Los marcadores indican zonas aproximadas, no la dirección del inmueble. El mapa muestra los resultados de esta página.</p>
        <Script id="mapa-catalogo" src={`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(clave!)}&libraries=maps,marker&v=weekly&language=es&region=CO`} nonce={nonce} onReady={() => setCargado(true)} onError={() => setError(true)} />
      </section>}
    </div>
  </div>
}