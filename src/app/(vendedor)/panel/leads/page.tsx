import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { listarLeadsDelVendedor } from '@/lib/leads/consultas'
import { listarConversacionesVendedor } from '@/lib/ia/consultas'
import { DrawerConversacionIA } from '@/components/panel/drawer-conversacion-ia'
import { Lock, Phone } from 'lucide-react'
import { formatearFechaHora } from '@/lib/fechas/formato'
import { AccionesLead } from './acciones-fila'

export const metadata: Metadata = {
  title: 'Leads | Portal Inmobiliario',
  robots: { index: false, follow: false },
}

const ETIQUETA_ESTADO = { aceptado: 'Aceptado', descartado: 'Descartado' } as const

export default async function PaginaLeads() {
  const supabase = await crearClienteServidor()

  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario.user) redirect('/login')

  const [leads, conversaciones] = await Promise.all([
    listarLeadsDelVendedor(supabase),
    listarConversacionesVendedor(supabase, usuario.user.id),
  ])

  const pendientes = leads.filter((l) => l.estado === 'nuevo').length

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-titulo text-3xl font-semibold text-tinta">Bandeja de leads</h1>
      <p className="mt-1 text-tinta-suave">
        {pendientes} {pendientes === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}
      </p>

      {leads.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-linea bg-superficie p-10 text-center text-tinta-suave">
          Todavia no has recibido mensajes sobre tus propiedades.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {leads.map((lead) => {
            const conv = conversaciones[lead.id]
            return (
              <li key={lead.id} className="break-words rounded-2xl border border-linea bg-superficie p-5 [overflow-wrap:anywhere]">
                <div className="flex items-start gap-4">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca-suave text-sm font-semibold text-marca">
                    {iniciales(lead.nombre_mostrado)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-sm">
                        <span className="font-semibold text-tinta">{lead.nombre_mostrado}</span>
                        {lead.propiedades?.titulo && <span className="text-tinta-suave"> · {lead.propiedades.titulo}</span>}
                      </p>
                      <span className="cifra text-xs text-tinta-tenue">{formatearFechaHora(lead.creado_en)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-tinta-suave">{lead.mensaje}</p>

                    {lead.leads_contacto ? (
                      <p className="cifra mt-3 inline-flex flex-wrap items-center gap-x-2 rounded-lg border border-linea px-3 py-1.5 text-sm text-tinta">
                        <Phone aria-hidden="true" className="h-3.5 w-3.5 text-marca" />
                        {lead.leads_contacto.correo} · {lead.leads_contacto.telefono}
                      </p>
                    ) : (
                      <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-linea px-3 py-1.5 text-xs text-tinta-suave">
                        <Lock aria-hidden="true" className="h-3.5 w-3.5" />
                        Contacto visible al aceptar
                      </p>
                    )}
                  </div>
                </div>

                {lead.estado === 'nuevo' ? (
                  <AccionesLead id={lead.id} />
                ) : (
                  <p className="mt-4 border-t border-linea pt-3 text-sm text-tinta-tenue">{ETIQUETA_ESTADO[lead.estado]}</p>
                )}

                {conv && (
                  <DrawerConversacionIA
                    conversacionId={conv.id}
                    mensajes={conv.mensajes}
                    tituloPropiedad={lead.propiedades?.titulo}
                    nombreComprador={lead.nombre_mostrado}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

/** Iniciales del nombre que el comprador decidio mostrar (avatar decorativo). */
function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?'
}
