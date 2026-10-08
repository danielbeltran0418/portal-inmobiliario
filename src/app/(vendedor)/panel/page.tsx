import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { CalendarDays, Clock3, Home, MessageSquare, Plus, ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Aviso, ChipEstado, EstadoVacio } from '@/components/ui/compuestos'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { contarPorEstado, filasDelPanel, type PropiedadCruda } from '@/lib/propiedades/panel'
import { contarLeadsNuevos } from '@/lib/leads/consultas'
import { miBloqueoDeCitas } from '@/lib/citas/faltas'
import { formatearFechaHora } from '@/lib/fechas/formato'

export const metadata: Metadata = {
  title: 'Mis propiedades | Portal Inmobiliario',
  description: 'Publica y administra tus propiedades en venta y arriendo.',
  // Privada: no se indexa, y ademas no se sigue ningun enlace desde ella.
  robots: { index: false, follow: false },
}

/**
 * Listado de propiedades del vendedor: la primera pantalla que ve al entrar.
 *
 * El .eq('vendedor_id', ...) de abajo NO es redundante: 20260827000600_propiedades.sql
 * define DOS politicas SELECT permisivas para `authenticated` sobre esta tabla
 * (propiedades_lectura_dueno: vendedor_id = auth.uid(); propiedades_lectura_publica:
 * estado = 'publicada', que tambien alcanza a authenticated). Postgres combina
 * politicas permisivas del mismo comando con OR, asi que sin este filtro un
 * vendedor autenticado recibe sus propias filas MAS todas las propiedades
 * publicadas de cualquier otro vendedor -- "mis propiedades" dejaria de
 * significar "las mias" (visto en vivo: ver tests/rls/propiedades.test.ts,
 * "SIN filtro explicito"). La consulta trae `imagenes_propiedad(id)` --
 * relacion anidada de PostgREST, no una columna -- solo para poder contar sus
 * imagenes, que es lo que pide faltantesParaPublicar via filasDelPanel.
 */
export default async function PaginaPanelVendedor() {
  const supabase = await crearClienteServidor()

  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario.user) redirect('/login')

  const { data } = await supabase
    .from('propiedades')
    .select('id, titulo, estado, precio, barrio_id, descripcion, imagenes_propiedad(id, orden)')
    .eq('vendedor_id', usuario.user.id)
    .order('actualizado_en', { ascending: false })

  const filas = filasDelPanel((data ?? []) as unknown as PropiedadCruda[])
  const nuevos = await contarLeadsNuevos(supabase, usuario.user.id)
  const resumen = contarPorEstado(filas)

  // Sin horario semanal el asistente no tiene horas que ofrecer y nadie puede
  // agendar: se le dice al vendedor en su primera pantalla, no en una tercera.
  const [{ count: franjasSemanales }, bloqueadoHasta] = await Promise.all([
    supabase.from('disponibilidad_semanal')
      .select('id', { count: 'exact', head: true })
      .eq('vendedor_id', usuario.user.id),
    miBloqueoDeCitas(supabase),
  ])

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-superficie-alt/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-marca">Panel del vendedor</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-tinta">Mis propiedades</h1>
            <p className="mt-2 text-tinta-suave">Administra tus anuncios, visitas y mensajes desde un solo lugar.</p>
          </div>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/panel/propiedades/nueva"><Plus data-icon="inline-start" />Publicar una propiedad</Link>
          </Button>
        </header>

        {franjasSemanales === 0 && <Aviso variante="aviso" titulo="Completa tu disponibilidad"><Link href="/panel/disponibilidad" className="font-semibold underline">Marca tus horarios</Link> para que los compradores puedan agendar visitas.</Aviso>}
        {bloqueadoHasta && <Aviso variante="peligro" titulo="Agenda temporalmente bloqueada">Tienes 3 faltas por cancelar o mover visitas con menos de 8 horas de antelación. No recibirás visitas nuevas hasta el {formatearFechaHora(bloqueadoHasta)}.</Aviso>}

        <section aria-label="Resumen de tus anuncios" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ['Publicadas', resumen.publicadas, 'bg-marca-suave text-marca'],
            ['Borradores', resumen.borradores, 'bg-superficie-alt text-tinta-suave'],
            ['Pausadas', resumen.pausadas, 'bg-realce-suave text-realce'],
            ['Vendidas', resumen.vendidas, 'bg-exito-suave text-exito'],
          ] as const).map(([etiqueta, valor, color]) => (
            <div key={etiqueta} className={`rounded-2xl p-4 text-center ${color}`}>
              <p className="text-2xl font-bold">{valor}</p>
              <p className="mt-0.5 text-xs text-tinta-suave">{etiqueta}</p>
            </div>
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <Card className="border-linea bg-superficie"><CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-linea-suave"><CardTitle className="text-xl">Tus anuncios</CardTitle><Link href="/panel/propiedades/nueva" className="hidden text-sm font-semibold text-marca hover:underline sm:inline">Nuevo anuncio <ArrowUpRight aria-hidden="true" className="ml-1 inline" /></Link></CardHeader><CardContent className="p-0">{filas.length === 0 ? <EstadoVacio titulo="Todavía no has publicado ninguna propiedad" descripcion="Publica tu primera propiedad y empieza a recibir contactos de compradores." icono={Home}><span className="sr-only">Todavía no has publicado ninguna propiedad</span><Button asChild><Link href="/panel/propiedades/nueva"><Plus data-icon="inline-start" />Crear anuncio</Link></Button></EstadoVacio> : <ul className="divide-y divide-linea-suave">{filas.map((fila) => <li key={fila.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-4"><div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-marca-suave">{fila.portadaId ? <Image src={`/imagen/${fila.portadaId}`} alt="" width={160} height={128} unoptimized className="h-full w-full object-cover" /> : <Home aria-hidden="true" className="size-6 text-marca/60" />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link href={`/panel/propiedades/${fila.id}`} className="max-w-full break-words text-base font-semibold text-tinta hover:text-marca hover:underline" title={fila.titulo}>{fila.titulo}</Link><ChipEstado estado={fila.estado}>{fila.estadoTexto}</ChipEstado></div><p className="mt-1 text-sm text-tinta-suave">{fila.precioTexto}</p>{fila.faltantes.length > 0 && <p className="mt-2 text-xs text-aviso">Falta: {fila.faltantes.join(', ')}</p>}</div></div><div className="flex shrink-0 gap-2"><Button asChild variant="ghost" size="sm" className="hidden text-marca sm:inline-flex"><Link href="/panel/leads">Ver leads</Link></Button><Button asChild variant="outline" size="sm" className="w-full sm:w-auto"><Link href={`/panel/propiedades/${fila.id}`}>Editar</Link></Button></div></li>)}</ul>}</CardContent></Card>
          <aside className="flex flex-col gap-4"><Card className="border-linea bg-superficie"><CardHeader><CardTitle className="text-base">Accesos rápidos</CardTitle></CardHeader><CardContent className="flex flex-col gap-2"><Button asChild variant="ghost" className="justify-start"><Link href="/panel/leads"><MessageSquare data-icon="inline-start" />Mensajes recibidos{nuevos > 0 && <Badge variant="secondary" className="ml-auto">{nuevos}</Badge>}</Link></Button><Button asChild variant="ghost" className="justify-start"><Link href="/panel/citas"><CalendarDays data-icon="inline-start" />Visitas</Link></Button><Button asChild variant="ghost" className="justify-start"><Link href="/panel/disponibilidad"><Clock3 data-icon="inline-start" />Disponibilidad</Link></Button></CardContent></Card></aside>
        </div>
      </div>
    </main>
  )
}

