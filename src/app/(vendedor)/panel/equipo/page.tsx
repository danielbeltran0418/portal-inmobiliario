import Link from 'next/link'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { FormularioEquipo } from './formulario'
import { quitarAgente } from './acciones'
export const metadata = { title: 'Mi equipo | Portal Inmobiliario', robots: { index: false, follow: false } }
export default async function PaginaEquipo() {
  const db = await crearClienteServidor()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')
  const activo = process.env.EQUIPOS_PRO_ENABLED === 'true'
  const { data: plan } = activo ? await db.from('suscripciones_plan').select('plan').eq('usuario_id',user.id).gt('vigente_hasta',new Date().toISOString()).maybeSingle() : { data: null }
  const propietario = plan?.plan === 'pro'
  const { data: miembros } = activo ? await db.from('equipo_miembros').select('agente_id,propietario_id').eq('propietario_id',user.id) : { data: [] }
  const { data: resumen, error } = activo ? await db.rpc('resumen_equipo') : { data: [], error: null }
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 text-tinta">
    <Link href="/panel" className="text-marca">Volver a mis propiedades</Link>
    <h1 className="font-titulo text-4xl">Mi equipo</h1>
    <p className="text-tinta-suave">Conecta los agentes de tu inmobiliaria y consulta sus publicaciones activas. Cada agente conserva la gestión de sus propios inmuebles y contactos.</p>
    {!activo ? <p>Los equipos están en preparación.</p> : <>
      <FormularioEquipo propietario={false} />
      {propietario && <FormularioEquipo propietario />}
      <section className="space-y-3"><h2 className="font-titulo text-2xl">Publicaciones del equipo</h2>
        {error ? <p>No pudimos cargar el resumen.</p> : !(resumen?.length) ? <p>Aún no hay un equipo Pro activo asociado a tu cuenta.</p> : <ul className="space-y-3">{resumen.map((fila: { agente_id: string; publicaciones: number }) => <li key={fila.agente_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-linea p-4">
          <span className="break-all">{fila.agente_id === user.id ? 'Mi cuenta' : 'Agente '+fila.agente_id.slice(0,8)}: {fila.publicaciones} publicaciones</span>
          {miembros?.some(m => m.agente_id === fila.agente_id) && <form action={quitarAgente}><input type="hidden" name="agente" value={fila.agente_id} /><button className="min-h-11 px-3 text-marca">Quitar del equipo</button></form>}
        </li>)}</ul>}
      </section>
    </>}
  </main>
}