'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { BusquedaGuardada, construirQueryStringBusqueda } from '@/lib/comprador/busquedas';
import { eliminarBusquedaAction } from '@/lib/comprador/acciones-busquedas';

export function TarjetaBusquedaGuardada({ busqueda }: { busqueda: BusquedaGuardada }) {
  const [isPending, startTransition] = useTransition();

  const handleEliminar = () => {
    if (confirm('¿Eliminar esta búsqueda guardada?')) {
      startTransition(async () => {
        await eliminarBusquedaAction(busqueda.id);
      });
    }
  };

  const barrioSlug = (busqueda.filtros?.barrio as string) || '';
  const queryString = construirQueryStringBusqueda(busqueda.filtros);
  const urlEjecutar = barrioSlug ? `/${barrioSlug}${queryString}` : `/${queryString}`;

  const filtrosLista = Object.entries(busqueda.filtros || {}).filter(
    ([k, v]) => v !== undefined && v !== null && v !== '' && k !== 'barrio'
  );

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-xl border border-linea bg-superficie shadow-xs">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-lg text-tinta">{busqueda.nombre}</h3>
          {busqueda.notificaciones_activas && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60">
              🔔 Notificaciones activas
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {barrioSlug && (
            <span className="rounded-md bg-superficie-alt px-2 py-0.5 text-xs text-tinta-suave border border-linea">
              Barrio: {barrioSlug}
            </span>
          )}
          {filtrosLista.map(([k, v]) => (
            <span
              key={k}
              className="rounded-md bg-superficie-alt px-2 py-0.5 text-xs text-tinta-suave border border-linea"
            >
              {k}: <strong className="text-tinta">{String(v)}</strong>
            </span>
          ))}
          {filtrosLista.length === 0 && !barrioSlug && (
            <span className="text-xs text-tinta-tenue">Todos los inmuebles</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center">
        <Link
          href={urlEjecutar}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-marca text-marca-contraste hover:bg-marca-fuerte transition-colors"
        >
          <span>Ejecutar búsqueda</span>
          <span>→</span>
        </Link>
        <button
          type="button"
          onClick={handleEliminar}
          disabled={isPending}
          className="px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
          aria-label="Eliminar búsqueda"
        >
          {isPending ? 'Borrando...' : 'Eliminar'}
        </button>
      </div>
    </div>
  );
}
