import { Search } from 'lucide-react'

const TIPOS = [
  ['apartamento', 'Apartamento'],
  ['casa', 'Casa'],
  ['local', 'Local'],
  ['lote', 'Lote'],
  ['oficina', 'Oficina'],
] as const

const CAMPO =
  'h-12 w-full rounded-lg border border-linea bg-superficie px-3 text-base text-tinta focus-visible:border-marca focus-visible:outline-2 focus-visible:outline-marca/40'

/**
 * Buscador de la portada: lo primero que se ve, porque buscar es el motivo de
 * visita. Envia por GET a /buscar, que valida y redirige al catalogo del barrio
 * (src/app/buscar/route.ts). Sin barrios no se pinta: un formulario que no
 * puede buscar nada solo confunde.
 */
export function BuscadorPortada({ barrios }: { barrios: { nombre: string; slug: string }[] }) {
  if (barrios.length === 0) return null

  return (
    <form
      action="/buscar"
      method="get"
      className="mx-auto mt-10 flex max-w-3xl flex-col gap-4 rounded-2xl border border-linea bg-superficie p-5 text-left shadow-lg sm:p-6"
    >
      <fieldset className="flex w-fit gap-1 rounded-lg bg-superficie-alt p-1">
        <legend className="sr-only">Operación</legend>
        {(
          [
            ['venta', 'Venta'],
            ['arriendo', 'Arriendo'],
          ] as const
        ).map(([valor, texto]) => (
          <label key={valor} className="cursor-pointer">
            <input
              type="radio"
              name="operacion"
              value={valor}
              defaultChecked={valor === 'venta'}
              className="peer sr-only"
            />
            <span className="block min-h-11 rounded-md px-5 py-2.5 text-sm font-semibold text-tinta-suave transition-colors peer-checked:bg-superficie peer-checked:text-tinta peer-checked:shadow-xs peer-focus-visible:outline-2 peer-focus-visible:outline-marca">
              {texto}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_1.2fr_auto] lg:items-end">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-tinta-suave">
          Barrio
          <select name="barrio" required className={CAMPO}>
            {barrios.map((barrio) => (
              <option key={barrio.slug} value={barrio.slug}>
                {barrio.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-semibold text-tinta-suave">
          Tipo
          <select name="tipo" defaultValue="" className={CAMPO}>
            <option value="">Cualquiera</option>
            {TIPOS.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-semibold text-tinta-suave">
          Precio máximo
          <input
            type="text"
            name="precio_max"
            inputMode="numeric"
            placeholder="$ 0"
            autoComplete="off"
            className={CAMPO}
          />
        </label>

        <button
          type="submit"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-marca px-6 text-base font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte sm:col-span-2 lg:col-span-1"
        >
          <Search aria-hidden="true" className="size-4" />
          Buscar
        </button>
      </div>
    </form>
  )
}
