import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/auth/sesion';
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor';
import { obtenerBusquedasGuardadas } from '@/lib/comprador/busquedas';
import { TarjetaBusquedaGuardada } from '@/components/comprador/TarjetaBusquedaGuardada';

export const metadata: Metadata = {
  title: 'Búsquedas Guardadas | Portal Inmobiliario',
  description: 'Tus criterios y alertas de búsqueda guardadas en el Portal Inmobiliario.',
  robots: { index: false, follow: false },
};

export default async function PaginaBusquedas() {
  const sesion = await sesionActual();
  if (!sesion.idUsuario) redirect('/login');

  const supabase = await crearClienteServidor();
  const busquedas = await obtenerBusquedasGuardadas(supabase, sesion.idUsuario);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-tinta">Búsquedas Guardadas</h2>
        <span className="text-sm text-tinta-suave">
          {busquedas.length} {busquedas.length === 1 ? 'búsqueda' : 'búsquedas'}
        </span>
      </div>

      {busquedas.length === 0 ? (
        <div className="rounded-xl border border-linea bg-superficie p-12 text-center">
          <div className="mx-auto w-12 h-12 text-tinta-tenue mb-4">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
          </div>
          <p className="text-lg font-medium text-tinta">No tienes búsquedas guardadas</p>
          <p className="mt-1 text-sm text-tinta-suave max-w-sm mx-auto">
            Cuando filtres propiedades en el catálogo, pulsa &quot;Guardar búsqueda&quot; para repetir tus consultas con un solo clic.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm font-medium text-marca-contraste hover:bg-marca-fuerte transition-colors"
            >
              Ir al catálogo
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {busquedas.map((b) => (
            <TarjetaBusquedaGuardada key={b.id} busqueda={b} />
          ))}
        </div>
      )}
    </div>
  );
}
