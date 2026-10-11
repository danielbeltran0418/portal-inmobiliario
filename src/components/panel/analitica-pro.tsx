import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
export async function AnaliticaPro({ usuarioId }: { usuarioId: string }) {
  const db = await crearClienteServidor()
  const { data: suscripcion } = await db.from('suscripciones_plan').select('plan,vigente_hasta').eq('usuario_id', usuarioId).gt('vigente_hasta', new Date().toISOString()).maybeSingle()
  if (suscripcion?.plan !== 'pro') return null
  const desde = new Date(new Date().getTime() - 30 * 24 * 60 * 60_000).toISOString().slice(0,10)
  const [{ data: metricas, error }, { count: contactos, error: errorContactos }] = await Promise.all([
    db.from('metricas_propiedad').select('visitas,dia').gte('dia', desde),
    db.from('leads').select('id', { count: 'exact', head: true }).eq('vendedor_id', usuarioId).gte('creado_en', `${desde}T00:00:00Z`),
  ])
  const visitas = (metricas ?? []).reduce((total, fila) => total + Number(fila.visitas), 0)
  return <section className="rounded-3xl border border-linea bg-superficie p-6" aria-labelledby="titulo-analitica">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="titulo-analitica" className="font-titulo text-2xl text-tinta">Tu actividad en los últimos 30 días</h2><Link href="/panel/equipo" className="text-sm font-semibold text-marca">Gestionar mi equipo</Link></div>
    {error || errorContactos ? <p className="mt-4 text-sm text-tinta-suave">No pudimos cargar la actividad ahora.</p> : <dl className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl bg-superficie-alt p-5"><dt className="text-sm text-tinta-suave">Consultas a tus fichas</dt><dd className="mt-2 text-3xl font-semibold text-tinta">{visitas}</dd></div>
      <div className="rounded-2xl bg-superficie-alt p-5"><dt className="text-sm text-tinta-suave">Solicitudes de información</dt><dd className="mt-2 text-3xl font-semibold text-tinta">{contactos ?? 0}</dd></div>
    </dl>}
    <p className="mt-4 text-xs text-tinta-suave">Las consultas cuentan cargas de la ficha, no personas únicas. Los contactos reflejan solicitudes registradas en el portal.</p>
  </section>
}