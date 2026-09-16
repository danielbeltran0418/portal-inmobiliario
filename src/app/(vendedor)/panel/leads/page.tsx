import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { listarLeadsDelVendedor } from '@/lib/leads/consultas'
import { listarConversacionesVendedor } from '@/lib/ia/consultas'
import { DrawerConversacionIA } from '@/components/panel/drawer-conversacion-ia'
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

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-tinta">Mensajes recibidos</h1>
      {leads.length === 0 ? (
        <p className="mt-8 rounded-md border border-linea bg-superficie p-8 text-center text-tinta-suave">
          Todavia no has recibido mensajes sobre tus propiedades.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {leads.map((lead) => {
            const conv = conversaciones[lead.id]
            return (
              <li key={lead.id} className="rounded-md border border-linea bg-superficie p-5">
                <p className="text-sm text-tinta-tenue">{lead.propiedades?.titulo}</p>
                <p className="mt-1 font-medium text-tinta">{lead.nombre_mostrado}</p>
                <p className="mt-2 whitespace-pre-wrap text-tinta-suave">{lead.mensaje}</p>

                {lead.leads_contacto && (
                  <p className="cifra mt-3 text-sm text-tinta">
                    {lead.leads_contacto.correo} · {lead.leads_contacto.telefono}
                  </p>
                )}

                {lead.estado === 'nuevo' ? (
                  <AccionesLead id={lead.id} />
                ) : (
                  <p className="mt-3 text-sm text-tinta-tenue">{ETIQUETA_ESTADO[lead.estado]}</p>
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