'use client';

import { useState, useTransition } from 'react';
import { Heart } from 'lucide-react';
import { conmutarFavoritoAction } from '@/lib/comprador/acciones-favoritos';

interface BotonFavoritoProps {
  propiedadId: string;
  inicialEsFavorito?: boolean;
  className?: string;
  mostrarTexto?: boolean;
  /** 'icono': circulo blanco sobre la foto de una tarjeta (diseño de Figma Make). */
  variante?: 'boton' | 'icono';
}

export const CLASE_CORAZON_ICONO =
  'inline-flex h-9 w-9 items-center justify-center rounded-full bg-superficie/90 shadow-sm backdrop-blur-sm transition-[color,background-color,transform] hover:bg-superficie active:scale-90';

export function BotonFavorito({
  propiedadId,
  inicialEsFavorito = false,
  className = '',
  mostrarTexto = false,
  variante = 'boton',
}: BotonFavoritoProps) {
  const [esFavorito, setEsFavorito] = useState(inicialEsFavorito);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    // Actualización optimista
    const nuevoEstado = !esFavorito;
    setEsFavorito(nuevoEstado);
    setError(null);

    startTransition(async () => {
      const res = await conmutarFavoritoAction(propiedadId);
      if (!res.exito) {
        // Revertir en caso de error
        setEsFavorito(!nuevoEstado);
        setError(res.error ?? 'No se pudo actualizar el favorito');
      } else if (res.favorito !== undefined) {
        setEsFavorito(res.favorito);
      }
    });
  };

  const clase =
    variante === 'icono'
      ? `${CLASE_CORAZON_ICONO} ${esFavorito ? 'text-peligro' : 'text-tinta-suave hover:text-peligro'}`
      : `inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-[color,background-color,border-color,transform] active:scale-[0.97] ${
          esFavorito
            ? 'border-peligro/30 bg-peligro-suave text-peligro'
            : 'border-linea bg-superficie text-tinta-suave hover:border-peligro/40 hover:text-peligro'
        }`;

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={`${clase} ${className}`}
        aria-label={esFavorito ? 'Eliminar de favoritos' : 'Agregar a favoritos'}
        aria-pressed={esFavorito}
        title={error ?? undefined}
        data-testid="boton-favorito"
      >
        <Heart
          aria-hidden="true"
          className={`h-5 w-5 transition-transform ${isPending ? 'scale-90' : 'scale-100'}`}
          fill={esFavorito ? 'currentColor' : 'none'}
          strokeWidth={1.8}
        />
        {mostrarTexto && (
          <span>{esFavorito ? 'En favoritos' : 'Guardar en favoritos'}</span>
        )}
      </button>
      {error && (
        <span role="alert" className="sr-only">
          {error}
        </span>
      )}
    </>
  );
}
