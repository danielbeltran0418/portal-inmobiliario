import Link from 'next/link'
import type { FiltrosCatalogo } from '@/lib/catalogo/filtros'

const CAMPO =
  'block w-full rounded-xl border border-linea bg-fondo px-3 py-2.5 text-base text-tinta transition-colors focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/25'
const ETIQUETA_GRUPO = 'mb-3 block text-xs font-semibold uppercase tracking-wider text-tinta-suave'
const ESTRATOS = [1, 2, 3, 4, 5, 6] as const

/** "Al menos N": cualquiera, 1+, 2+, 3+, 4+. */
function SelectorMinimo({ nombre, etiqueta, valor }: { nombre: string; etiqueta: string; valor?: number }) {
  return (
    <label className="block text-xs text-tinta-suave">
      {etiqueta}
      <select className={`${CAMPO} mt-1`} name={nombre} defaultValue={valor ?? ''}>
        <option value="">Cualquiera</option>
        {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}+</option>)}
      </select>
    </label>
  )
}

/**
 * Filtros en columna lateral (diseño de Figma Make), compartidos por el
 * catalogo de un barrio y el de una ciudad. Formulario GET: la URL es la fuente
 * de verdad del catalogo, y leerFiltros la valida.
 */
export function FiltrosLaterales({ filtros, limpiarHref }: { filtros: FiltrosCatalogo; limpiarHref: string }) {
  return (
    <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-64">
      <form method="get" className="flex flex-col gap-6 rounded-2xl border border-linea bg-superficie p-5">
        <label className="block">
          <span className={ETIQUETA_GRUPO}>Palabras clave</span>
          <input
            className={CAMPO}
            type="search"
            name="q"
            maxLength={60}
            defaultValue={filtros.texto}
            placeholder="Balcón, piscina…"
          />
        </label>
        <fieldset>
          <legend className={ETIQUETA_GRUPO}>Operación</legend>
          <div className="flex flex-col gap-1">
            {([['', 'Todas'], ['venta', 'Venta'], ['arriendo', 'Arriendo']] as const).map(([valor, texto]) => (
              <label key={texto} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm text-tinta">
                <input
                  type="radio"
                  name="operacion"
                  value={valor}
                  defaultChecked={(filtros.operacion ?? '') === valor}
                  className="h-4 w-4 accent-[var(--marca)]"
                />
                {texto}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className={ETIQUETA_GRUPO}>Tipo de inmueble</span>
          <select className={CAMPO} name="tipo" defaultValue={filtros.tipo ?? ''}>
            <option value="">Todos los tipos</option>
            {['apartamento', 'casa', 'local', 'lote', 'oficina'].map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className={ETIQUETA_GRUPO}>Precio (COP)</legend>
          <div className="flex flex-col gap-2">
            <label className="block text-xs text-tinta-suave">
              Precio mínimo
              <input
                className={`${CAMPO} cifra mt-1`}
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                name="precio_min"
                defaultValue={filtros.precioMin}
                placeholder="Mínimo"
              />
            </label>
            <label className="block text-xs text-tinta-suave">
              Precio máximo
              <input
                className={`${CAMPO} cifra mt-1`}
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                name="precio_max"
                defaultValue={filtros.precioMax}
                placeholder="Máximo"
              />
            </label>
          </div>
        </fieldset>

        {/* Lo que el comprador colombiano filtra siempre (migracion 20261012000100). */}
        <div className="grid grid-cols-2 gap-3">
          <SelectorMinimo nombre="habitaciones_min" etiqueta="Habitaciones" valor={filtros.habitacionesMin} />
          <SelectorMinimo nombre="banos_min" etiqueta="Baños" valor={filtros.banosMin} />
          <SelectorMinimo nombre="parqueaderos_min" etiqueta="Parqueaderos" valor={filtros.parqueaderosMin} />
          <label className="block text-xs text-tinta-suave">
            Administración máx.
            <input
              className={`${CAMPO} cifra mt-1`}
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              name="administracion_max"
              defaultValue={filtros.administracionMax}
              placeholder="Sin tope"
            />
          </label>
        </div>

        <fieldset>
          <legend className={ETIQUETA_GRUPO}>Estrato</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-tinta-suave">
              Desde
              <select className={`${CAMPO} mt-1`} name="estrato_min" defaultValue={filtros.estratoMin ?? ''}>
                <option value="">Cualquiera</option>
                {ESTRATOS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            <label className="block text-xs text-tinta-suave">
              Hasta
              <select className={`${CAMPO} mt-1`} name="estrato_max" defaultValue={filtros.estratoMax ?? ''}>
                <option value="">Cualquiera</option>
                {ESTRATOS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            className="w-full cursor-pointer rounded-xl bg-marca py-2.5 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte"
          >
            Filtrar
          </button>
          <Link
            href={limpiarHref}
            className="block w-full rounded-xl border border-linea py-2 text-center text-sm text-tinta-suave transition-colors hover:border-marca hover:text-marca"
          >
            Limpiar filtros
          </Link>
        </div>
      </form>
    </aside>
  )
}
