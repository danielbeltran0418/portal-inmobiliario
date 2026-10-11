CREATE TABLE public.configuracion_comercial (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  planes_activos boolean NOT NULL DEFAULT false
);
INSERT INTO public.configuracion_comercial(singleton,planes_activos) VALUES (true,false);
ALTER TABLE public.configuracion_comercial ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.configuracion_comercial FROM anon, authenticated;
GRANT ALL ON public.configuracion_comercial TO service_role;
ALTER TABLE public.propiedades ADD COLUMN publicada_hasta timestamptz;
GRANT SELECT (publicada_hasta) ON public.propiedades TO anon, authenticated;
CREATE POLICY propiedades_vigencia_publica ON public.propiedades AS RESTRICTIVE
FOR SELECT TO anon, authenticated USING (
  publicada_hasta IS NULL OR publicada_hasta > now()
  OR vendedor_id = (SELECT auth.uid()) OR public.es_super_admin()
);
CREATE FUNCTION public.aplicar_limites_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_plan text; v_vigencia timestamptz; v_limite integer; v_actuales integer;
BEGIN
  IF NOT coalesce((SELECT planes_activos FROM public.configuracion_comercial WHERE singleton),false) THEN RETURN NEW; END IF;
  IF NEW.estado <> 'publicada' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'publicada' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.vendedor_id::text, 0));
  SELECT plan, vigente_hasta INTO v_plan, v_vigencia FROM public.suscripciones_plan
    WHERE usuario_id = NEW.vendedor_id AND vigente_hasta > now();
  v_limite := CASE v_plan WHEN 'pro' THEN 2147483647 WHEN 'destacado' THEN 5 ELSE 1 END;
  SELECT count(*) INTO v_actuales FROM public.propiedades WHERE vendedor_id = NEW.vendedor_id
    AND id <> NEW.id AND estado = 'publicada' AND (publicada_hasta IS NULL OR publicada_hasta > now());
  IF v_actuales >= v_limite THEN RAISE EXCEPTION 'Límite de publicaciones del plan' USING ERRCODE = 'check_violation'; END IF;
  IF v_plan IS NULL AND (SELECT count(*) FROM public.imagenes_propiedad WHERE propiedad_id = NEW.id) > 8 THEN
    RAISE EXCEPTION 'El plan básico admite ocho fotos' USING ERRCODE = 'check_violation';
  END IF;
  NEW.publicada_hasta := coalesce(v_vigencia, now() + interval '30 days');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.aplicar_limites_plan() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER propiedades_limites_plan BEFORE INSERT OR UPDATE OF estado ON public.propiedades
FOR EACH ROW EXECUTE FUNCTION public.aplicar_limites_plan();
CREATE OR REPLACE FUNCTION public.zona_aproximada_propiedad(p_propiedad_id uuid)
RETURNS TABLE (latitud double precision, longitud double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT floor(u.latitud / 0.005) * 0.005 + 0.0025, floor(u.longitud / 0.005) * 0.005 + 0.0025
  FROM public.propiedades_ubicacion u JOIN public.propiedades p ON p.id = u.propiedad_id
  WHERE u.propiedad_id = p_propiedad_id AND p.estado = 'publicada'
    AND (p.publicada_hasta IS NULL OR p.publicada_hasta > now())
    AND u.latitud IS NOT NULL AND u.longitud IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.zona_aproximada_propiedad(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zona_aproximada_propiedad(uuid) TO anon, authenticated;