-- ============================================================================
-- Barrios a escala nacional.
--
-- 1. ciudad tenia DEFAULT 'Barranquilla' (20260827000400): un barrio creado
--    sin ciudad quedaba en Barranquilla en silencio. Ahora es obligatoria y no
--    puede ir en blanco.
-- 2. El slug no admitia digitos ('^[a-z]+(-[a-z]+)*$'), asi que barrios como
--    "La 70" o "Villa Santos 2" no podian existir. Mismo arreglo que
--    20260904000200 hizo para las propiedades. Y como el slug es la URL
--    (/{barrio}) y es unico en todo el pais, dos barrios homonimos de ciudades
--    distintas se distinguen en el slug ("el-prado-barranquilla",
--    "el-prado-bucaramanga").
-- 3. Un slug igual a una ruta propia de la app quedaria tapado por ella. Se
--    prohiben los mismos segmentos que RUTAS_RESERVADAS
--    (src/lib/catalogo/rutas.ts; una prueba unitaria fija que coinciden).
-- ============================================================================

ALTER TABLE public.barrios ALTER COLUMN ciudad DROP DEFAULT;

ALTER TABLE public.barrios
  ADD CONSTRAINT barrios_ciudad_no_vacia CHECK (char_length(btrim(ciudad)) BETWEEN 2 AND 80);

ALTER TABLE public.barrios DROP CONSTRAINT IF EXISTS barrios_slug_check;
ALTER TABLE public.barrios ADD CONSTRAINT barrios_slug_check
  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80);

ALTER TABLE public.barrios ADD CONSTRAINT barrios_slug_no_reservado CHECK (slug NOT IN (
  'api', 'buscar', 'catalogo', 'confirmar', 'control', 'imagen', 'login', 'mi-cuenta',
  'notificaciones', 'panel', 'recuperar', 'registro', 'restablecer', 'verificar-correo'
));
