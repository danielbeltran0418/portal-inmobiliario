import Link from 'next/link'
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor'
import { FormularioPosicionamiento } from '@/components/admin/FormularioPosicionamiento'

export const dynamic = 'force-dynamic'

interface PropiedadParaAcuerdo {
  id: string
  titulo: string
  vendedor: {
    nombre: string
  } | null
}

export default async function PaginaNuevoPosicionamiento() {
  const supabase = await crearClienteServidor()
  const { data: propiedades } = await supabase
    .from('propiedades')
    .select('id, titulo, vendedor:vendedor_id (nombre)')
    .eq('estado', 'publicada')
    .order('titulo', { ascending: true })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/control/posicionamiento"
          className="text-xs font-semibold text-marca hover:underline"
        >
          &larr; Volver a Acuerdos de Posicionamiento
        </Link>
        <h1 className="mt-2 font-titulo text-2xl font-bold tracking-tight text-tinta">
          Registrar Acuerdo de Posicionamiento
        </h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Activa el distintivo de propiedad destacada y eleva su orden en el catálogo público
          durante la vigencia establecida.
        </p>
      </div>

      <div className="rounded-xl border border-linea bg-superficie p-6 shadow-xs">
        <FormularioPosicionamiento
          propiedades={(propiedades || []) as unknown as PropiedadParaAcuerdo[]}
        />
      </div>
    </div>
  )
}
