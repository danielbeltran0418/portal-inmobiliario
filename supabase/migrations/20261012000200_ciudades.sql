-- ============================================================================
-- Ciudades: catalogo por ciudad (/ciudad/{slug}) para un portal nacional.
--
-- No hay tabla de ciudades: la ciudad es un atributo del barrio
-- (barrios.ciudad, obligatoria desde 20261011000200). Lo que faltaba es un
-- slug estable para la URL, y aqui se CALCULA en la base a partir del nombre,
-- asi que nadie puede dejar dos barrios de "Bogotá" con slugs distintos:
-- "Bogotá", "bogota" y "BOGOTÁ " dan siempre "bogota".
--
-- La regla del slug es la misma que slugDeTexto() en src/lib/catalogo/ciudades.ts
-- (una prueba unitaria fija las dos con los mismos ejemplos).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.slug_de_texto(p_texto text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT btrim(
    regexp_replace(
      lower(translate(btrim(p_texto), 'ÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòù', 'AEIOUUNaeiouunAEIOUaeiou')),
      '[^a-z0-9]+', '-', 'g'
    ),
    '-'
  );
$$;

ALTER TABLE public.barrios ADD COLUMN ciudad_slug text;

UPDATE public.barrios SET ciudad_slug = public.slug_de_texto(ciudad);

ALTER TABLE public.barrios
  ALTER COLUMN ciudad_slug SET NOT NULL,
  ADD CONSTRAINT barrios_ciudad_slug_formato CHECK (ciudad_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Siempre derivado: ni el admin ni nadie lo escribe a mano.
CREATE OR REPLACE FUNCTION public.fijar_ciudad_slug()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.ciudad := btrim(NEW.ciudad);
  NEW.ciudad_slug := public.slug_de_texto(NEW.ciudad);
  RETURN NEW;
END;
$$;

CREATE TRIGGER barrios_fijar_ciudad_slug
  BEFORE INSERT OR UPDATE OF ciudad, ciudad_slug ON public.barrios
  FOR EACH ROW EXECUTE FUNCTION public.fijar_ciudad_slug();

CREATE INDEX IF NOT EXISTS barrios_ciudad_slug_idx ON public.barrios (ciudad_slug) WHERE activo;

-- /ciudad es ahora una ruta del portal: ningun barrio puede llamarse asi.
-- Misma lista que RUTAS_RESERVADAS (src/lib/catalogo/rutas.ts).
ALTER TABLE public.barrios DROP CONSTRAINT IF EXISTS barrios_slug_no_reservado;
ALTER TABLE public.barrios ADD CONSTRAINT barrios_slug_no_reservado CHECK (slug NOT IN (
  'api', 'buscar', 'catalogo', 'ciudad', 'confirmar', 'control', 'imagen', 'login', 'mi-cuenta',
  'notificaciones', 'panel', 'recuperar', 'registro', 'restablecer', 'verificar-correo'
));
