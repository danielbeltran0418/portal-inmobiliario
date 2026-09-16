'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ENLACES = [
  { ruta: '/mi-cuenta', label: 'Solicitudes y Chats IA' },
  { ruta: '/mi-cuenta/favoritos', label: 'Favoritos' },
  { ruta: '/mi-cuenta/busquedas', label: 'Búsquedas guardadas' },
  { ruta: '/mi-cuenta/datos', label: 'Mis datos y privacidad' },
];

export function NavegacionComprador() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-2 border-b border-linea pb-4 mb-8 overflow-x-auto text-sm font-medium">
      {ENLACES.map((item) => {
        const activo = pathname === item.ruta;
        return (
          <Link
            key={item.ruta}
            href={item.ruta}
            className={`px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activo
                ? 'bg-marca text-marca-contraste font-semibold shadow-xs'
                : 'text-tinta-suave hover:text-tinta hover:bg-superficie-alt'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
