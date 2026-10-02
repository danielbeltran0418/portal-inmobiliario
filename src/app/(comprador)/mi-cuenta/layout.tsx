import { ReactNode } from 'react';
import { NavegacionComprador } from '@/components/comprador/NavegacionComprador';

export default function LayoutMiCuenta({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <section className="relative overflow-hidden rounded-2xl border border-linea bg-superficie p-6 shadow-sm sm:p-8">
        <div className="absolute -right-16 -top-20 size-48 rounded-full bg-marca/10 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-marca">Espacio personal</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-tinta sm:text-4xl">Panel del comprador</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-tinta-suave">
            Organiza tus propiedades favoritas, revisa tus solicitudes y mantén tus búsquedas listas para volver cuando quieras.
          </p>
        </div>
      </section>

      <NavegacionComprador />

      <div className="min-w-0">{children}</div>
    </div>
  );
}
