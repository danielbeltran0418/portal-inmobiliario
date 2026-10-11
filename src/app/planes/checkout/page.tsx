import { notFound } from 'next/navigation'
import { CheckoutPlan } from '@/components/planes/checkout-plan'
import { PLANES, precioConfigurado } from '@/lib/planes/catalogo'
import { configuracionWompi } from '@/lib/planes/configuracion'

export default async function PaginaCheckout({ searchParams }: { searchParams: Promise<{ plan?: string; periodo?: string }> }) {
  const parametros = await searchParams
  if (parametros.plan !== 'destacado' && parametros.plan !== 'pro') notFound()
  const periodo = parametros.periodo === 'anual' ? 'anual' : 'mensual'
  const plan = PLANES.find((entrada) => entrada.id === parametros.plan)!
  const precio = precioConfigurado(process.env[`PLAN_${plan.id.toUpperCase()}_${periodo.toUpperCase()}_COP`])
  return <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16">
    <p className="text-sm font-semibold text-marca">Tu plan de publicación</p>
    <h1 className="mt-3 font-titulo text-4xl text-tinta">{plan.nombre}</h1>
    <div className="mt-8 rounded-3xl border border-linea bg-superficie p-7 shadow-sm">
      <p className="text-tinta">Periodo: {periodo === 'anual' ? 'un año' : 'un mes'}</p>
      <p className="mt-3 text-2xl font-semibold text-tinta">{precio === null ? 'Precio por definir' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(precio)}</p>
      <p className="mt-3 text-sm text-tinta-suave">Pago único por el periodo seleccionado. No hay renovación automática ni cobros posteriores sin tu autorización.</p>
      <CheckoutPlan plan={parametros.plan} periodo={periodo} disponible={precio !== null && configuracionWompi() !== null} />
    </div>
  </main>
}