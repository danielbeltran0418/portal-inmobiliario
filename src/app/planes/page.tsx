import type { Metadata } from 'next'
import { PlanesPublicacion } from '@/components/planes/planes-publicacion'
import { precioConfigurado } from '@/lib/planes/catalogo'

export const metadata: Metadata = { title: 'Planes de publicación' }
export default function PaginaPlanes() {
  return <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 sm:px-6">
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <p className="mb-3 text-sm font-semibold text-marca">Para propietarios, agentes e inmobiliarias</p>
      <h1 className="font-titulo text-4xl text-tinta sm:text-5xl">Un plan para tu próximo paso</h1>
      <p className="mt-4 text-lg text-tinta-suave">Comienza con una propiedad. Amplía tu presencia a medida que crece tu negocio.</p>
    </div>
    <PlanesPublicacion tarifas={{
      destacado: { mensual: precioConfigurado(process.env.PLAN_DESTACADO_MENSUAL_COP), anual: precioConfigurado(process.env.PLAN_DESTACADO_ANUAL_COP) },
      pro: { mensual: precioConfigurado(process.env.PLAN_PRO_MENSUAL_COP), anual: precioConfigurado(process.env.PLAN_PRO_ANUAL_COP) },
    }} />
  </main>
}