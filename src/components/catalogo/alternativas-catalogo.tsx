import { TarjetaPropiedad } from '@/components/tarjeta-propiedad'
import type { Alternativa } from '@/lib/catalogo/alternativas'
export function AlternativasCatalogo({ propiedades }: { propiedades: Alternativa[] }) {
  if (!propiedades.length) return null
  return <section className="mt-12 border-t border-linea pt-8" aria-labelledby="alternativas-titulo">
    <h2 id="alternativas-titulo" className="font-titulo text-2xl text-tinta">Otras opciones en la misma ciudad</h2>
    <p className="mt-2 text-sm text-tinta-suave">Conservamos el tipo y la modalidad. Ampliamos el presupuesto hasta un 20% y quitamos otros filtros para ofrecerte más opciones.</p>
    <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{propiedades.map((propiedad) => <TarjetaPropiedad key={propiedad.id} propiedad={propiedad} barrioSlug={propiedad.barrioSlug} barrioNombre={propiedad.barrioNombre} />)}</ul>
  </section>
}