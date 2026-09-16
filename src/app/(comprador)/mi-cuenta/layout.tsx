import { ReactNode } from 'react';
import { NavegacionComprador } from '@/components/comprador/NavegacionComprador';

export default function LayoutMiCuenta({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-tinta">Panel del Comprador</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Gestiona tus solicitudes de contacto, propiedades favoritas, búsquedas guardadas y derechos sobre tus datos.
        </p>
      </div>

      <NavegacionComprador />

      {children}
    </div>
  );
}
