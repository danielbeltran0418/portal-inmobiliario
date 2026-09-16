import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { consultarEventosAuditoria } from '@/lib/admin/auditoria'
import { TablaAuditoria } from '@/components/admin/TablaAuditoria'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{
    accion?: string
    entidad?: string
    actor_id?: string
    desde?: string
    hasta?: string
    pagina?: string
  }>
}

export default async function PaginaAuditoria({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await crearClienteServidor()

  const pagina = params.pagina ? parseInt(params.pagina, 10) : 1
  const filtros = {
    accion: params.accion,
    entidad: params.entidad,
    actor_id: params.actor_id,
    desde: params.desde,
    hasta: params.hasta,
  }

  const resultado = await consultarEventosAuditoria(supabase, filtros, {
    pagina: isNaN(pagina) ? 1 : pagina,
    porPagina: 20,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-titulo text-2xl font-bold tracking-tight text-tinta">
          Bitácora de Auditoría del Sistema
        </h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Registro inmutable de seguridad: trazabilidad de inicios de sesión, bloqueos, moderación y acuerdos.
        </p>
      </div>

      <TablaAuditoria
        eventos={resultado.eventos}
        total={resultado.total}
        pagina={resultado.pagina}
        totalPaginas={resultado.totalPaginas}
      />
    </div>
  )
}
