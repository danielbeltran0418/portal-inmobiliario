-- ============================================================================
-- La direccion exacta deja de ser publica.
--
-- El spec es explicito: el catalogo publico muestra el barrio y una ubicacion
-- aproximada; la direccion completa se entrega al confirmarse una cita. Pero
-- 20260827000600 hacia GRANT SELECT ON public.propiedades TO anon, que es sobre
-- TODAS las columnas, y RLS no ayuda aqui: RLS filtra FILAS. Sobre una
-- propiedad publicada -- que la politica de lectura publica deja ver -- un
-- cliente anonimo podia pedir direccion, latitud y longitud y recibirlas.
--
-- Los privilegios de columna son el mecanismo adecuado: se revoca el SELECT de
-- tabla completa y se concede solo sobre las columnas publicas.
--
-- authenticated NO se toca: conserva el SELECT de tabla completa, asi que el
-- vendedor dueno y el super_admin siguen viendo la direccion de lo que las
-- politicas de RLS ya les dejan ver.
--
-- Consecuencia deliberada: un `select('*')` anonimo ahora falla con 42501. El
-- catalogo publico del SP1 tiene que enumerar columnas. Es lo que se quiere:
-- que anadir una columna sensible no la publique sola.
-- ============================================================================

REVOKE SELECT ON public.propiedades FROM anon;

-- Las 18 columnas publicas de las 21 de la tabla. Fuera quedan, a proposito,
-- direccion, latitud y longitud.
GRANT SELECT (
  id,
  vendedor_id,
  slug,
  titulo,
  descripcion,
  operacion,
  tipo_inmueble,
  precio,
  moneda,
  habitaciones,
  banos,
  area_m2,
  barrio_id,
  estado,
  destacada,
  destacada_hasta,
  creado_en,
  actualizado_en
) ON public.propiedades TO anon;
