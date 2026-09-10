-- Solo conserva URLs que llegaron a ser públicas. Sin FK: el historial debe
-- sobrevivir al borrado para distinguir 410 de un recurso nunca publicado.
CREATE TABLE public.rutas_publicas_propiedad (
  ruta text PRIMARY KEY CHECK (ruta ~ '^/[a-z0-9-]+/[a-z0-9-]+$'),
  propiedad_id uuid NOT NULL
);
CREATE INDEX rutas_publicas_por_propiedad ON public.rutas_publicas_propiedad(propiedad_id);
ALTER TABLE public.rutas_publicas_propiedad ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rutas_publicas_propiedad FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rutas_publicas_propiedad TO anon, authenticated;
GRANT ALL ON public.rutas_publicas_propiedad TO service_role;
CREATE POLICY rutas_publicas_lectura ON public.rutas_publicas_propiedad FOR SELECT TO anon, authenticated USING (true);

CREATE FUNCTION public.registrar_ruta_publica() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE barrio_slug text;
BEGIN
  IF NEW.estado = 'publicada' THEN
    SELECT slug INTO barrio_slug FROM public.barrios WHERE id = NEW.barrio_id AND activo;
    IF barrio_slug IS NOT NULL THEN
      INSERT INTO public.rutas_publicas_propiedad(ruta, propiedad_id)
      VALUES ('/' || barrio_slug || '/' || NEW.slug, NEW.id)
      ON CONFLICT (ruta) DO UPDATE SET propiedad_id = EXCLUDED.propiedad_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.registrar_ruta_publica() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER propiedades_registrar_ruta_publica AFTER INSERT OR UPDATE ON public.propiedades
FOR EACH ROW EXECUTE FUNCTION public.registrar_ruta_publica();

-- Las rutas actualmente publicadas son evidencia suficiente. No reconstruir
-- ni adivinar URLs de propiedades que ya estaban pausadas antes de la migración.
INSERT INTO public.rutas_publicas_propiedad(ruta, propiedad_id)
SELECT '/' || b.slug || '/' || p.slug, p.id FROM public.propiedades p
JOIN public.barrios b ON b.id = p.barrio_id
WHERE p.estado = 'publicada' AND b.activo;
