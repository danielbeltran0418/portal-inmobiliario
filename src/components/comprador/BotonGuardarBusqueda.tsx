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
        className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-marca/30 bg-marca-suave text-marca hover:border-marca transition-colors ${className}`}
        data-testid="boton-guardar-busqueda"
      >
        <svg
          className="w-4 h-4 text-marca"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-tinta/50 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="dialogo-guardar-busqueda" className="bg-superficie rounded-xl shadow-xl border border-linea max-w-md w-full p-6 text-tinta">
            <div className="flex items-center justify-between mb-4">
              <h3 id="dialogo-guardar-busqueda" className="text-lg font-semibold">Guardar criterios de búsqueda</h3>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                aria-label="Cerrar"
                className="text-tinta-tenue hover:text-tinta-suave"
              >
                ✕
              </button>
            </div>

            {mensajeExito ? (
              <div className="p-4 bg-exito-suave text-exito rounded-lg text-sm font-medium text-center">
                {mensajeExito}
              </div>
            ) : (
              <form onSubmit={handleGuardar} className="space-y-4">
                {error && (
                  <div className="p-3 bg-peligro-suave text-peligro rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-tinta-suave mb-1">
                    Nombre para esta búsqueda
                  </label>
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Casas en Chapinero hasta 500M"
                    className="w-full px-3 py-2 border border-linea rounded-lg bg-superficie text-tinta focus:outline-none focus:ring-2 focus:ring-marca"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="notificaciones"
                    checked={notificaciones}
                    onChange={(e) => setNotificaciones(e.target.checked)}
                    className="rounded border-linea text-marca focus:ring-marca"
                  />
                  <label htmlFor="notificaciones" className="text-sm text-tinta-suave">
                    Notificarme cuando se publiquen propiedades similares
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalAbierto(false)}
                    className="px-4 py-2 text-sm text-tinta-suave hover:bg-superficie-alt rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    data-testid="boton-modal-guardar-busqueda"
                    disabled={isPending}
                    className="px-4 py-2 text-sm font-medium text-marca-contraste bg-marca hover:bg-marca-fuerte disabled:opacity-50 rounded-lg transition-colors"
                  >
                    {isPending ? 'Guardando...' : 'Confirmar y guardar'}
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
