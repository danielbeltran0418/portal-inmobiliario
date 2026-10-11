'use client'

import { useEffect, useState } from 'react'
interface BarrioSugerido { nombre: string; slug: string; ciudad: string; codigo_postal: string | null }
export function AutocompletarUbicacion({ ciudades, elegir }: { ciudades: { nombre: string; slug: string }[]; elegir: (opcion: { barrio?: string; ciudad?: string }) => void }) {
  const [texto, setTexto] = useState('')
  const [barrios, setBarrios] = useState<BarrioSugerido[]>([])
  const [fallo, setFallo] = useState(false)
  useEffect(() => {
    const q = texto.trim()
    if (!/^[\p{L}\p{N} ]{2,60}$/u.test(q)) return
    const cancelar = new AbortController()
    const temporizador = setTimeout(async () => {
      try {
        const respuesta = await fetch(`/api/catalogo/ubicaciones?q=${encodeURIComponent(q)}`, { signal: cancelar.signal })
        if (!respuesta.ok) throw new Error('Sin sugerencias')
        const datos = await respuesta.json() as { ubicaciones?: unknown }
        if (!Array.isArray(datos.ubicaciones)) throw new Error('Sin sugerencias')
        const validos = datos.ubicaciones.filter((fila): fila is BarrioSugerido => Boolean(fila && typeof fila === 'object' && typeof fila.nombre === 'string' && typeof fila.ciudad === 'string' && typeof fila.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fila.slug))).slice(0,8)
        setBarrios(validos); setFallo(false)
      } catch { if (!cancelar.signal.aborted) { setBarrios([]); setFallo(true) } }
    }, 250)
    return () => { cancelar.abort(); clearTimeout(temporizador) }
  }, [texto])
  const etiquetaBarrio = (b: BarrioSugerido) => `${b.nombre}, ${b.ciudad}${b.codigo_postal ? ` (${b.codigo_postal})` : ''}`
  return <div className="sm:col-span-2">
    <label htmlFor="ubicacion-autocomplete" className="mb-2 block text-sm font-medium text-tinta">¿Dónde quieres vivir?</label>
    <input id="ubicacion-autocomplete" type="search" list="ubicaciones-sugeridas" value={texto} maxLength={100} autoComplete="off" placeholder="Ciudad, barrio o código postal" onChange={(evento) => {
      const valor = evento.target.value; setTexto(valor)
      const ciudad = ciudades.find((entrada) => entrada.nombre.toLocaleLowerCase('es') === valor.toLocaleLowerCase('es'))
      const barrio = barrios.find((entrada) => etiquetaBarrio(entrada) === valor)
      elegir(barrio ? { barrio: barrio.slug } : ciudad ? { ciudad: ciudad.slug } : {})
      evento.target.setCustomValidity(valor && !barrio && !ciudad ? 'Selecciona una ubicación de las sugerencias o deja este campo vacío y elige una ciudad.' : '')
    }} className="h-12 w-full rounded-xl border border-linea bg-fondo px-4 text-base text-tinta focus-visible:outline-2 focus-visible:outline-marca" />
    <datalist id="ubicaciones-sugeridas">{ciudades.map((ciudad) => <option key={`ciudad-${ciudad.slug}`} value={ciudad.nombre} />)}{barrios.map((barrio) => <option key={barrio.slug} value={etiquetaBarrio(barrio)} />)}</datalist>
    {fallo && <p role="status" className="mt-2 text-xs text-tinta-suave">No pudimos cargar los barrios. Puedes elegir una ciudad abajo.</p>}
  </div>
}