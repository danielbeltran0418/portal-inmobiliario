import Link from 'next/link'
import { Heart } from 'lucide-react'
import { BotonFavorito, CLASE_CORAZON_ICONO } from './BotonFavorito'

/**
 * El ♡ sobre la foto de cada tarjeta del catalogo (diseño de Figma Make).
 *
 * Al anonimo no se le pinta un boton que solo diria "inicia sesion" tras el
 * clic: es un enlace al login que, al entrar, lo devuelve a la misma pagina
 * del catalogo (con sus filtros) via `volver`, que el login ya sanea.
 */
export function CorazonTarjeta({
  propiedadId,
  conSesion,
  favorito,
  volver,
}: {
  propiedadId: string
  conSesion: boolean
  favorito: boolean
  volver: string
}) {
  if (!conSesion) {
    return (
      <Link
        href={`/login?volver=${encodeURIComponent(volver)}`}
        aria-label="Inicia sesión para guardar en favoritos"
        className={`${CLASE_CORAZON_ICONO} text-tinta-suave hover:text-peligro`}
      >
        <Heart aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
      </Link>
    )
  }
  return <BotonFavorito propiedadId={propiedadId} inicialEsFavorito={favorito} variante="icono" />
}
