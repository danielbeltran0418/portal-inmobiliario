-- ============================================================================
-- Sitemap a escala nacional.
--
-- src/app/sitemap.ts recorria TODAS las fichas publicadas para saber que
-- barrios tienen anuncios, y lanzaba error al pasar de 50.000 URLs (el tope del
-- protocolo). Ahora:
--   * /sitemap.xml: portada, ciudades y barrios con anuncios (esta funcion).
--   * /sitemaps/fichas/{n}: las fichas, de 40.000 en 40.000.
--
-- SECURITY INVOKER: RLS decide que es visible (las mismas filas que ve anon en
-- el catalogo). Solo barrios activos con al menos una publicada con foto, que
-- es lo que el catalogo muestra.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.barrios_con_anuncios()
RETURNS TABLE (slug text, ciudad_slug text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT DISTINCT b.slug, b.ciudad_slug
  FROM public.barrios b
  JOIN public.propiedades p ON p.barrio_id = b.id AND p.estado = 'publicada'
  WHERE b.activo
    AND EXISTS (SELECT 1 FROM public.imagenes_propiedad i WHERE i.propiedad_id = p.id)
  ORDER BY b.slug;
$$;

REVOKE EXECUTE ON FUNCTION public.barrios_con_anuncios() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.barrios_con_anuncios() TO anon, authenticated, service_role;

-- /sitemaps es ahora una ruta del portal. Misma lista que RUTAS_RESERVADAS.
ALTER TABLE public.barrios DROP CONSTRAINT IF EXISTS barrios_slug_no_reservado;
ALTER TABLE public.barrios ADD CONSTRAINT barrios_slug_no_reservado CHECK (slug NOT IN (
  'api', 'buscar', 'catalogo', 'ciudad', 'confirmar', 'control', 'imagen', 'login', 'mi-cuenta',
  'notificaciones', 'panel', 'recuperar', 'registro', 'restablecer', 'sitemaps', 'verificar-correo'
));
