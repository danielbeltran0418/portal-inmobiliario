import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/auth/sesion';
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor';
import { obtenerFavoritosUsuario } from '@/lib/comprador/favoritos';
import { BotonFavorito } from '@/components/comprador/BotonFavorito';

export const metadata: Metadata = {
  title: 'Mis Favoritos | Portal Inmobiliario',
  description: 'Propiedades guardadas como favoritas en el Portal Inmobiliario.',
  robots: { index: false, follow: false },
};

export default async function PaginaFavoritos() {
  const sesion = await sesionActual();
  if (!sesion.idUsuario) redirect('/login');

  const supabase = await crearClienteServidor();
  const favoritos = await obtenerFavoritosUsuario(supabase, sesion.idUsuario);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-tinta">Propiedades Favoritas</h2>
        <span className="text-sm text-tinta-suave">
          {favoritos.length} {favoritos.length === 1 ? 'propiedad' : 'propiedades'}
        </span>
      </div>

      {favoritos.length === 0 ? (
        <div className="rounded-xl border border-linea bg-superficie p-12 text-center">
          <div className="mx-auto w-12 h-12 text-tinta-tenue mb-4">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </div>
          <p className="text-lg font-medium text-tinta">Aún no tienes propiedades favoritas</p>
          <p className="mt-1 text-sm text-tinta-suave max-w-sm mx-auto">
            Explora el catálogo y pulsa el corazón en las propiedades que te interesen para guardarlas aquí.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm font-medium text-marca-contraste hover:bg-marca-fuerte transition-colors"
            >
              Explorar propiedades
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {favoritos.map((fav) => {
            const p = fav.propiedad;
            if (!p) return null;
            const foto = p.imagenes_propiedad?.[0];
            const rutaPropiedad = p.barrio
              ? `/${p.barrio.nombre.toLowerCase().replace(/\s+/g, '-')}/${p.slug}`
              : `/propiedades/${p.id}`;

            return (
              <div
                key={fav.id}
                className="relative flex flex-col overflow-hidden rounded-xl border border-linea bg-superficie shadow-xs hover:shadow-md transition-shadow group"
              >
                <div className="relative aspect-[16/10] w-full bg-superficie-alt overflow-hidden">
                  {foto ? (
                    <Image
                      src={`/imagen/${foto.ruta_storage.split('/').pop()?.replace('.webp', '')}`}
                      alt={p.titulo}
                      width={480}
                      height={300}
                      unoptimized
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-tinta-tenue">
                      Sin imagen
                    </div>
                  )}

                  <div className="absolute top-3 right-3 z-10">
                    <BotonFavorito
                      propiedadId={p.id}
                      inicialEsFavorito={true}
                      className="shadow-sm"
                    />
                  </div>

                  <span className="absolute bottom-3 left-3 rounded-md bg-black/60 backdrop-blur-xs px-2.5 py-1 text-xs font-medium text-white uppercase">
                    {p.operacion}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <p className="text-xl font-bold text-tinta">
                    {new Intl.NumberFormat('es-CO', {
                      style: 'currency',
                      currency: 'COP',
                      maximumFractionDigits: 0,
                    }).format(p.precio)}
                  </p>

                  <h3 className="mt-1 font-semibold text-tinta line-clamp-1">
                    {p.titulo}
                  </h3>

                  <p className="mt-1 text-xs text-tinta-suave">
                    {p.barrio?.nombre ? `${p.barrio.nombre}, Barranquilla` : 'Barranquilla'}
                  </p>

                  <div className="mt-4 pt-4 border-t border-linea flex items-center justify-between text-xs text-tinta-suave">
                    <span>
                      {p.habitaciones ? `${p.habitaciones} hab.` : ''} {p.banos ? `· ${p.banos} baños` : ''}
                    </span>
                    <Link
                      href={rutaPropiedad}
                      className="font-medium text-marca hover:underline"
                    >
                      Ver ficha →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
