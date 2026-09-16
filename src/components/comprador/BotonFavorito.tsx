'use client';

import { useState, useTransition } from 'react';
import { conmutarFavoritoAction } from '@/lib/comprador/acciones-favoritos';

interface BotonFavoritoProps {
  propiedadId: string;
  inicialEsFavorito?: boolean;
  className?: string;
  mostrarTexto?: boolean;
}

export function BotonFavorito({
  propiedadId,
  inicialEsFavorito = false,
  className = '',
  mostrarTexto = false,
}: BotonFavoritoProps) {
  const [esFavorito, setEsFavorito] = useState(inicialEsFavorito);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    // Actualización optimista
    const nuevoEstado = !esFavorito;
    setEsFavorito(nuevoEstado);

    startTransition(async () => {
      const res = await conmutarFavoritoAction(propiedadId);
      if (!res.exito) {
        // Revertir en caso de error
        setEsFavorito(!nuevoEstado);
        alert(res.error ?? 'No se pudo actualizar el favorito');
      } else if (res.favorito !== undefined) {
        setEsFavorito(res.favorito);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-sm font-medium ${
        esFavorito
          ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-400'
          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'
      } ${className}`}
      aria-label={esFavorito ? 'Eliminar de favoritos' : 'Agregar a favoritos'}
      data-testid="boton-favorito"
    >
      <svg
        className={`w-5 h-5 transition-transform ${isPending ? 'scale-90' : 'scale-100'}`}
        fill={esFavorito ? 'currentColor' : 'none'}
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={esFavorito ? 0 : 1.8}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
      {mostrarTexto && (
        <span>{esFavorito ? 'En favoritos' : 'Guardar en favoritos'}</span>
      )}
    </button>
  );
}
