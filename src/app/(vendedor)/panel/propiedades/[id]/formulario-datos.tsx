'use client'

import { useActionState, useRef, useState } from 'react'
import { actualizarPropiedad, type EstadoPropiedad } from '../acciones'
import { OPERACIONES, TIPOS_INMUEBLE } from '@/lib/validacion/esquemas'

const INICIAL: EstadoPropiedad = {}

const ETIQUETA_OPERACION: Record<(typeof OPERACIONES)[number], string> = {
  venta: 'Venta',
  arriendo: 'Arriendo',
}

const ETIQUETA_TIPO: Record<(typeof TIPOS_INMUEBLE)[number], string> = {
  apartamento: 'Apartamento',
  casa: 'Casa',
  local: 'Local',
  lote: 'Lote',
  oficina: 'Oficina',
}

/**
 * `defaultValue` seguro para un input numerico opcional. `precio`,
 * `habitaciones`, `banos` y `area_m2` son anulables (un borrador recien
 * creado no los tiene todavia -- ver la migracion 20260907000100 para
 * `precio`), y esta es la version de esa regla para un INPUT, en pareja con
 * `textoPrecio` (src/lib/propiedades/panel.ts), que resuelve lo mismo para el
 * texto de listado. `defaultValue={null}` no revienta React -- equivale a no
 * poner valor inicial -- pero se normaliza a '' para no depender de eso, y
 * porque FormularioDatos es un componente cliente con hooks: no se puede
 * invocar fuera de un render real, asi que esta funcion se exporta aparte
 * para poder probarla sin renderizar el formulario.
 */
export function valorInicialNumerico(valor: number | null): number | string {
  return valor ?? ''
}

export interface PropiedadFormulario {
  id: string
  titulo: string
  descripcion: string | null
  operacion: (typeof OPERACIONES)[number]
  tipo_inmueble: (typeof TIPOS_INMUEBLE)[number]
  precio: number | null
  habitaciones: number | null
  banos: number | null
  area_m2: number | null
  barrio_id: string | null
  direccion: string | null
  /** "lat, lng" o null. */
  coordenadas?: string | null
}

export interface BarrioOpcion {
  id: string
  nombre: string
}

/**
 * Cliente, con useActionState(actualizarPropiedad, {}) -- mismo patron que
 * src/app/(auth)/login/formulario.tsx. Todos los campos usan defaultValue, no
 * value: son inputs no controlados (igual que login/registro), y es
 * exactamente lo que evita la trampa de `precio`. Un borrador recien creado
 * tiene `precio: null` (migracion 20260907000100); `defaultValue={null}` es
 * valido en React (equivale a no poner valor inicial), mientras que
 * `value={null}` sin mas dispara la advertencia de input no controlado en
 * cuanto el vendedor escribe algo. `?? ''` de respaldo por prolijidad, no
 * porque `null` sin mas fuera a reventar aqui como si reventaria
 * `precio.toLocaleString()` (ver textoPrecio en lib/propiedades/panel.ts,
 * que resuelve el mismo problema para la version de listado).
 */
export function FormularioDatos({
  propiedad,
  barrios,
}: {
  propiedad: PropiedadFormulario
  barrios: BarrioOpcion[]
}) {
  const [estado, accion, pendiente] = useActionState(actualizarPropiedad, INICIAL)

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="id" value={propiedad.id} />

      <div>
        <label htmlFor="titulo" className="mb-1.5 block text-sm font-medium text-tinta">Título</label>
        <input
          id="titulo"
          name="titulo"
          defaultValue={propiedad.titulo}
          required
          minLength={10}
          maxLength={120}
          className="w-full rounded-xl border border-linea bg-fondo px-4 py-2.5 text-base text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25"
        />
        {estado.errores?.titulo && (
          <p role="alert" className="mt-1 text-sm text-peligro">{estado.errores.titulo}</p>
        )}
      </div>

      <div>
        <label htmlFor="descripcion" className="mb-1.5 block text-sm font-medium text-tinta">Descripción</label>
        <textarea
          id="descripcion"
          name="descripcion"
          defaultValue={propiedad.descripcion ?? ''}
          rows={5}
          className="w-full rounded-xl border border-linea bg-fondo px-4 py-2.5 text-base text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25"
        />
        {estado.errores?.descripcion && (
          <p role="alert" className="mt-1 text-sm text-peligro">{estado.errores.descripcion}</p>
        )}
      </div>

      <div>
        <label htmlFor="operacion" className="mb-1.5 block text-sm font-medium text-tinta">Operación</label>
        <select
          id="operacion"
          name="operacion"
          defaultValue={propiedad.operacion}
          className="w-full rounded-xl border border-linea bg-fondo px-4 py-2.5 text-base text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25"
        >
          {OPERACIONES.map((op) => (
            <option key={op} value={op}>{ETIQUETA_OPERACION[op]}</option>
          ))}
        </select>
        {estado.errores?.operacion && (
          <p role="alert" className="mt-1 text-sm text-peligro">{estado.errores.operacion}</p>
        )}
      </div>

      <div>
        <label htmlFor="tipo_inmueble" className="mb-1.5 block text-sm font-medium text-tinta">Tipo de inmueble</label>
        <select
          id="tipo_inmueble"
          name="tipo_inmueble"
          defaultValue={propiedad.tipo_inmueble}
          className="w-full rounded-xl border border-linea bg-fondo px-4 py-2.5 text-base text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25"
        >
          {TIPOS_INMUEBLE.map((tipo) => (
            <option key={tipo} value={tipo}>{ETIQUETA_TIPO[tipo]}</option>
          ))}
        </select>
        {estado.errores?.tipo_inmueble && (
          <p role="alert" className="mt-1 text-sm text-peligro">{estado.errores.tipo_inmueble}</p>
        )}
      </div>

      <div>
        <label htmlFor="precio" className="mb-1.5 block text-sm font-medium text-tinta">Precio (COP)</label>
        <input
          id="precio"
          name="precio"
          type="number"
          min="0"
          step="1"
          defaultValue={valorInicialNumerico(propiedad.precio)}
          className="w-full rounded-xl border border-linea bg-fondo px-4 py-2.5 text-base text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25"
        />
        {estado.errores?.precio && (
          <p role="alert" className="mt-1 text-sm text-peligro">{estado.errores.precio}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="habitaciones" className="mb-1.5 block text-sm font-medium text-tinta">Habitaciones</label>
          <input
            id="habitaciones"
            name="habitaciones"
            type="number"
            min="0"
            defaultValue={valorInicialNumerico(propiedad.habitaciones)}
            className="w-full rounded-xl border border-linea bg-fondo px-4 py-2.5 text-base text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25"
          />
          {estado.errores?.habitaciones && (
            <p role="alert" className="mt-1 text-sm text-peligro">{estado.errores.habitaciones}</p>
          )}
        </div>

        <div>
          <label htmlFor="banos" className="mb-1.5 block text-sm font-medium text-tinta">Baños</label>
          <input
            id="banos"
            name="banos"
            type="number"
            min="0"
            defaultValue={valorInicialNumerico(propiedad.banos)}
            className="w-full rounded-xl border border-linea bg-fondo px-4 py-2.5 text-base text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25"
          />
          {estado.errores?.banos && (
            <p role="alert" className="mt-1 text-sm text-peligro">{estado.errores.banos}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="area_m2" className="mb-1.5 block text-sm font-medium text-tinta">Área (m²)</label>
        <input
          id="area_m2"
          name="area_m2"
          type="number"
          min="0"
          step="0.01"
          defaultValue={valorInicialNumerico(propiedad.area_m2)}
          className="w-full rounded-xl border border-linea bg-fondo px-4 py-2.5 text-base text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25"
        />
        {estado.errores?.area_m2 && (
          <p role="alert" className="mt-1 text-sm text-peligro">{estado.errores.area_m2}</p>
        )}
      </div>

      <div>
        <label htmlFor="barrio_id" className="mb-1.5 block text-sm font-medium text-tinta">Barrio</label>
        <select
          id="barrio_id"
          name="barrio_id"
          defaultValue={propiedad.barrio_id ?? ''}
          className="w-full rounded-xl border border-linea bg-fondo px-4 py-2.5 text-base text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25"
        >
          <option value="">Elige un barrio</option>
          {barrios.map((barrio) => (
            <option key={barrio.id} value={barrio.id}>{barrio.nombre}</option>
          ))}
        </select>
        {estado.errores?.barrio_id && (
          <p role="alert" className="mt-1 text-sm text-peligro">{estado.errores.barrio_id}</p>
        )}
      </div>

      <div>
        <label htmlFor="direccion" className="mb-1.5 block text-sm font-medium text-tinta">Dirección</label>
        <input
          id="direccion"
          name="direccion"
          defaultValue={propiedad.direccion ?? ''}
          className="w-full rounded-xl border border-linea bg-fondo px-4 py-2.5 text-base text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25"
        />
        {/* No es cosmetico: sin esto el vendedor puede dejarla en blanco por
            desconfianza. El catalogo publico solo va a mostrar el barrio. */}
        <p className="mt-1 text-sm text-tinta-suave">
          No se muestra públicamente: en el catálogo solo se ve el barrio.
        </p>
        {estado.errores?.direccion && (
          <p role="alert" className="mt-1 text-sm text-peligro">{estado.errores.direccion}</p>
        )}
      </div>

      <CampoCoordenadas inicial={propiedad.coordenadas ?? ''} error={estado.errores?.coordenadas} />

      {estado.error && <p role="alert" className="text-sm text-peligro">{estado.error}</p>}

      <button
        type="submit"
        disabled={pendiente}
        className="w-full cursor-pointer rounded-xl bg-marca py-3 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte disabled:opacity-60"
      >
        {pendiente ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </form>
  )
}

/**
 * Punto del inmueble para el mapa de la ficha. Privado: el publico solo ve un
 * circulo de ~500 m alrededor de un centro redondeado (src/lib/mapa/zona.ts).
 * Se pega desde Google Maps o se toma del GPS si el vendedor esta en el sitio.
 */
function CampoCoordenadas({ inicial, error }: { inicial: string; error?: string }) {
  const campo = useRef<HTMLInputElement>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const usarUbicacion = () => {
    if (!navigator.geolocation) {
      setAviso('Tu navegador no permite obtener la ubicación.')
      return
    }
    setAviso('Obteniendo tu ubicación…')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (campo.current) campo.current.value = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`
        setAviso('Listo. Revisa que estés en el inmueble y guarda los cambios.')
      },
      () => setAviso('No pudimos obtener tu ubicación. Pega las coordenadas desde Google Maps.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div>
      <label htmlFor="coordenadas" className="mb-1.5 block text-sm font-medium text-tinta">Ubicación en el mapa</label>
      <div className="flex flex-wrap gap-2">
        <input
          ref={campo}
          id="coordenadas"
          name="coordenadas"
          defaultValue={inicial}
          placeholder="10.9878, -74.7889"
          inputMode="decimal"
          className="min-w-0 flex-1 rounded-xl border border-linea bg-fondo px-4 py-2.5 text-base text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25"
        />
        <button
          type="button"
          onClick={usarUbicacion}
          className="cursor-pointer rounded-xl border border-linea px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:border-marca hover:text-marca"
        >
          Usar mi ubicación
        </button>
      </div>
      <p className="mt-1 text-sm text-tinta-suave">
        En Google Maps, mantén presionado el inmueble y copia las coordenadas. En la ficha solo se muestra la zona
        aproximada (unos 500 m), nunca el punto exacto.
      </p>
      {aviso && <p role="status" className="mt-1 text-sm text-tinta-suave">{aviso}</p>}
      {error && <p role="alert" className="mt-1 text-sm text-peligro">{error}</p>}
    </div>
  )
}
