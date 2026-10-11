import Link from 'next/link'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { sesionActual } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'

export default async function ResultadoPago({ searchParams }: { searchParams: Promise<{ orden?: string }> }) {
  const sesion = await sesionActual()
  if (!sesion.idUsuario) redirect('/login')
  const parametros = await searchParams
  const id = z.string().uuid().safeParse(parametros.orden)
  const cliente = await crearClienteServidor()
  const { data: orden } = id.success ? await cliente.from('ordenes_plan').select('id,plan,periodo,estado,ambiente,centavos,requiere_revision').eq('id', id.data).eq('usuario_id', sesion.idUsuario).maybeSingle() : { data: null }
  const pagada = orden?.estado === 'APPROVED'
  return <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16">
    <div className="rounded-3xl border border-linea bg-superficie p-8 text-center shadow-sm">
      <h1 className="font-titulo text-3xl text-tinta">{!orden ? 'No encontramos esta orden' : orden.requiere_revision ? 'Pago recibido, revisión pendiente' : pagada ? 'Pago confirmado' : orden.estado === 'PENDING' ? 'Estamos verificando tu pago' : 'El pago no se completó'}</h1>
      <p className="mt-4 text-tinta-suave">{orden?.requiere_revision ? 'Tu pago fue recibido. La activación necesita una revisión de tu plan y tus publicaciones. Conservamos tu plan actual mientras conciliamos la activación o devolución. Guarda el comprobante para contactar al soporte.' : pagada ? orden.ambiente === 'test' ? 'Este es un pago de prueba. No se realizó un cobro real ni se activó un plan.' : 'Tu plan está activo. Puedes descargar el comprobante de pago.' : 'La confirmación depende de Wompi. Puedes volver a esta página para consultar el estado.'}</p>
      {pagada && <a href={`/planes/comprobante/${orden.id}`} className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-marca px-5 font-semibold text-marca-contraste">Descargar comprobante</a>}
      <Link href="/panel" className="mt-6 block text-sm font-semibold text-marca">Ir a mi panel</Link>
    </div>
  </main>
}