import { ReactNode } from 'react';
import { NavegacionComprador } from '@/components/comprador/NavegacionComprador';

/**
 * Marco de la cuenta del comprador (diseño de Figma Make): un encabezado sobrio
 * y la navegacion de secciones en pastillas. El h1 lo pone cada pagina.
 */
export default function LayoutMiCuenta({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-tinta-tenue">Espacio personal</p>
        <h2 className="mt-1 font-titulo text-lg font-semibold text-tinta-suave">Panel del comprador</h2>
      </div>

      <NavegacionComprador />

      <div className="min-w-0">{children}</div>
    </div>
  );
}
