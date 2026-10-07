import type { Metadata } from 'next';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/auth/sesion';
import { crearClienteServidor } from '@/lib/supabase/cliente-servidor';
import { obtenerFavoritosUsuario } from '@/lib/comprador/favoritos';
import { BotonFavorito } from '@/components/comprador/BotonFavorito';
import { TarjetaPropiedad } from '@/components/tarjeta-propiedad';

export const metadata: Metadata = {
  title: 'Mis Favoritos | Portal Inmobiliario',
  description: 'Propiedades guardadas como favoritas en el Portal Inmobiliario.',
  robots: { index: false, follow: false },
};

/**
 * Favoritos con la misma tarjeta del catalogo (diseño de Figma Make) y el
 * corazon encima para quitarlos. El enlace usa el slug del barrio y la foto el
 * id de la imagen: antes se armaban con el nombre del barrio y el nombre del
 * archivo, y fallaban con tildes, espacios o cualquier foto.
 */
export default async function PaginaFavoritos() {
  const sesion = await sesionActual();
  if (!sesion.idUsuario) redirect('/login');

  const supabase = await crearClienteServidor();
  const favoritos = await obtenerFavoritosUsuario(supabase, sesion.idUsuario);
  // Sin barrio no hay ruta publica a la que enlazar.
  const conRuta = favoritos.filter((fav) => fav.propiedad?.barrio?.slug);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-titulo text-2xl font-semibold text-tinta">Propiedades Favoritas</h2>
        <span className="text-sm text-tinta-suave">
          {conRuta.length} {conRuta.length === 1 ? 'propiedad' : 'propiedades'}
        </span>
      </div>

      {conRuta.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-linea bg-superficie px-6 py-16 text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-marca-suave">
            <Heart aria-hidden="true" className="h-8 w-8 text-marca" strokeWidth={1.5} />
          </span>
          <p className="font-titulo text-xl text-tinta">Aún no tienes propiedades favoritas</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-tinta-suave">
            Explora el catálogo y pulsa el corazón en las propiedades que te interesen para guardarlas aquí.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center rounded-xl bg-marca px-5 py-2.5 text-sm font-semibold text-marca-contraste transition-colors hover:bg-marca-fuerte"
          >
            Explorar propiedades
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {conRuta.map(({ id, propiedad: p }) => (
            <TarjetaPropiedad
              key={id}
              propiedad={{ ...p, imagenes_propiedad: p.imagenes_propiedad ?? [] }}
              barrioSlug={p.barrio!.slug}
              barrioNombre={p.barrio!.nombre}
              accion={<BotonFavorito propiedadId={p.id} inicialEsFavorito className="shadow-sm" />}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
