ALTER TABLE public.propiedades ADD COLUMN prioridad_plan smallint NOT NULL DEFAULT 0 CHECK (prioridad_plan BETWEEN 0 AND 2);
ALTER TABLE public.propiedades ADD COLUMN tour360_url text CHECK (tour360_url IS NULL OR length(tour360_url) <= 2000);
GRANT SELECT (prioridad_plan,tour360_url) ON public.propiedades TO anon,authenticated;
GRANT INSERT (tour360_url),UPDATE (tour360_url) ON public.propiedades TO authenticated;
CREATE TABLE public.metricas_propiedad (
  propiedad_id uuid NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  dia date NOT NULL DEFAULT current_date,
  visitas bigint NOT NULL DEFAULT 0 CHECK (visitas >= 0),
  PRIMARY KEY(propiedad_id,dia)
);
ALTER TABLE public.metricas_propiedad ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.metricas_propiedad FROM anon,authenticated;
GRANT SELECT ON public.metricas_propiedad TO authenticated;
GRANT ALL ON public.metricas_propiedad TO service_role;
CREATE POLICY metricas_dueno_pro ON public.metricas_propiedad FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.propiedades p JOIN public.suscripciones_plan s ON s.usuario_id = p.vendedor_id
    WHERE p.id = propiedad_id AND p.vendedor_id = (SELECT auth.uid()) AND s.plan = 'pro' AND s.vigente_hasta > now())
);
CREATE FUNCTION public.registrar_visita_propiedad(p_propiedad_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.metricas_propiedad(propiedad_id,dia,visitas)
  SELECT id, (now() AT TIME ZONE 'America/Bogota')::date, 1 FROM public.propiedades WHERE id = p_propiedad_id
    AND estado = 'publicada' AND (publicada_hasta IS NULL OR publicada_hasta > now())
  ON CONFLICT(propiedad_id,dia) DO UPDATE SET visitas = public.metricas_propiedad.visitas + 1;
$$;
REVOKE ALL ON FUNCTION public.registrar_visita_propiedad(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_visita_propiedad(uuid) TO service_role;
CREATE FUNCTION public.validar_tour_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.tour360_url IS NULL THEN RETURN NEW; END IF;
  IF NEW.tour360_url !~ '^https://(my\.matterport\.com|kuula\.co|www\.kuula\.co)/' THEN
    RAISE EXCEPTION 'Proveedor de tour no admitido' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suscripciones_plan WHERE usuario_id = NEW.vendedor_id AND vigente_hasta > now()) THEN
    RAISE EXCEPTION 'El tour requiere un plan activo' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validar_tour_plan() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER propiedades_tour_plan BEFORE INSERT OR UPDATE OF tour360_url ON public.propiedades
FOR EACH ROW EXECUTE FUNCTION public.validar_tour_plan();
CREATE OR REPLACE FUNCTION public.aplicar_limites_plan() RETURNS trigger
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
  NEW.prioridad_plan := CASE v_plan WHEN 'pro' THEN 2 WHEN 'destacado' THEN 1 ELSE 0 END;
  NEW.publicada_hasta := coalesce(v_vigencia, now() + interval '30 days');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.confirmar_orden_plan(p_id uuid, p_transaccion text, p_centavos bigint, p_ambiente text, p_estado text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_orden public.ordenes_plan; v_desde timestamptz;
BEGIN
  SELECT * INTO v_orden FROM public.ordenes_plan WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_orden.centavos <> p_centavos OR v_orden.ambiente <> p_ambiente THEN RETURN false; END IF;
  IF v_orden.estado = 'APPROVED' THEN RETURN v_orden.transaccion_id = p_transaccion; END IF;
  IF p_estado NOT IN ('PENDING','APPROVED','DECLINED','VOIDED','ERROR') THEN RETURN false; END IF;
  UPDATE public.ordenes_plan SET estado = p_estado, transaccion_id = p_transaccion,
    pagado_en = CASE WHEN p_estado = 'APPROVED' THEN now() ELSE NULL END WHERE id = p_id;
  -- Sandbox registra comprobante de prueba, nunca derechos de producción.
  IF p_estado = 'APPROVED' AND p_ambiente = 'prod' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_orden.usuario_id::text, 0));
    SELECT greatest(now(), vigente_hasta) INTO v_desde FROM public.suscripciones_plan WHERE usuario_id = v_orden.usuario_id;
    INSERT INTO public.suscripciones_plan(usuario_id, plan, orden_id, vigente_hasta)
      VALUES (v_orden.usuario_id, v_orden.plan, p_id, coalesce(v_desde, now()) + CASE WHEN v_orden.periodo = 'anual' THEN interval '1 year' ELSE interval '1 month' END)
      ON CONFLICT (usuario_id) DO UPDATE SET plan = EXCLUDED.plan, orden_id = EXCLUDED.orden_id, vigente_hasta = EXCLUDED.vigente_hasta;
    UPDATE public.propiedades SET prioridad_plan = CASE v_orden.plan WHEN 'pro' THEN 2 ELSE 1 END, publicada_hasta = (SELECT vigente_hasta FROM public.suscripciones_plan WHERE usuario_id = v_orden.usuario_id) WHERE vendedor_id = v_orden.usuario_id AND estado = 'publicada';
  END IF;
  RETURN true;
END $$;
