'use client';

import { useState, useTransition } from 'react';
import { guardarBusquedaAction } from '@/lib/comprador/acciones-busquedas';

interface BotonGuardarBusquedaProps {
  filtrosActuales: Record<string, unknown>;
  className?: string;
}

export function BotonGuardarBusqueda({
  filtrosActuales,
  className = '',
}: BotonGuardarBusquedaProps) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [notificaciones, setNotificaciones] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await guardarBusquedaAction(nombre, filtrosActuales, notificaciones);
      if (res.exito) {
        setMensajeExito('¡Búsqueda guardada con éxito!');
        setTimeout(() => {
          setModalAbierto(false);
          setMensajeExito(null);
          setNombre('');
        }, 1500);
      } else {
        setError(res.error ?? 'No se pudo guardar la búsqueda');
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setModalAbierto(true)}
        className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300 transition-colors ${className}`}
        data-testid="boton-guardar-busqueda"
      >
        <svg
          className="w-4 h-4 text-indigo-600 dark:text-indigo-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
          />
        </svg>
        <span>Guardar búsqueda</span>
      </button>

      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Guardar criterios de búsqueda</h3>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {mensajeExito ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-medium text-center">
                {mensajeExito}
              </div>
            ) : (
              <form onSubmit={handleGuardar} className="space-y-4">
                {error && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Nombre para esta búsqueda
                  </label>
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Casas en Chapinero hasta 500M"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="notificaciones"
                    checked={notificaciones}
                    onChange={(e) => setNotificaciones(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="notificaciones" className="text-sm text-slate-600 dark:text-slate-300">
                    Notificarme cuando se publiquen propiedades similares
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalAbierto(false)}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    {isPending ? 'Guardando...' : 'Guardar búsqueda'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
