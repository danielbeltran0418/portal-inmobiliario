import { Search } from 'lucide-react'

const CAMPO =
  'h-12 w-full rounded-xl border border-linea bg-fondo px-4 text-base font-medium text-tinta focus-visible:border-marca focus-visible:outline-2 focus-visible:outline-marca/40'

/**
 * Buscador del hero de la portada (diseño de Figma Make): operacion y barrio en
 * una sola fila. Envia por GET a /buscar, que valida y redirige al catalogo del
 * barrio (src/app/buscar/route.ts); tipo y precio se filtran ya alli. Sin
 * barrios no se pinta: un formulario que no puede buscar nada solo confunde.
 *
 * Las etiquetas existen para lectores de pantalla aunque el diseño no las
 * muestre: un select sin nombre accesible es una barrera.
 */
export function BuscadorPortada({ barrios }: { barrios: { nombre: string; slug: string }[] }) {
  if (barrios.length === 0) return null

  return (
    <form
      action="/buscar"
      method="get"
      className="flex w-full max-w-2xl flex-col gap-2 rounded-2xl bg-superficie p-2 text-left shadow-2xl sm:flex-row"
    >
      <label htmlFor="buscador-operacion" className="sr-only">
        Operación
      </label>
      <select id="buscador-operacion" name="operacion" defaultValue="venta" className={`${CAMPO} sm:w-36`}>
        <option value="venta">Venta</option>
        <option value="arriendo">Arriendo</option>
      </select>

      <label htmlFor="buscador-barrio" className="sr-only">
        Barrio
      </label>
      <select id="buscador-barrio" name="barrio" required className={`${CAMPO} sm:flex-1`}>
        {barrios.map((barrio) => (
          <option key={barrio.slug} value={barrio.slug}>
            {barrio.nombre}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-marca px-6 text-base font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte"
      >
        <Search aria-hidden="true" className="size-4" />
        Buscar
      </button>
    </form>
  )
}
