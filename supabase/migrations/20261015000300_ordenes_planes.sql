CREATE TABLE public.ordenes_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('destacado','pro')),
  periodo text NOT NULL CHECK (periodo IN ('mensual','anual')),
  centavos bigint NOT NULL CHECK (centavos > 0 AND centavos <= 99999999900),
  ambiente text NOT NULL CHECK (ambiente IN ('test','prod')),
  estado text NOT NULL DEFAULT 'PENDING' CHECK (estado IN ('PENDING','APPROVED','DECLINED','VOIDED','ERROR')),
  transaccion_id text UNIQUE,
  creado_en timestamptz NOT NULL DEFAULT now(),
  vence_en timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  pagado_en timestamptz
);
ALTER TABLE public.ordenes_plan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ordenes_plan FROM anon, authenticated;
GRANT SELECT ON public.ordenes_plan TO authenticated;
GRANT ALL ON public.ordenes_plan TO service_role;
CREATE POLICY ordenes_lectura_dueno ON public.ordenes_plan FOR SELECT TO authenticated USING (usuario_id = (SELECT auth.uid()));

CREATE TABLE public.suscripciones_plan (
  usuario_id uuid PRIMARY KEY REFERENCES public.perfiles(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('destacado','pro')),
  orden_id uuid NOT NULL REFERENCES public.ordenes_plan(id),
  vigente_hasta timestamptz NOT NULL
);
ALTER TABLE public.suscripciones_plan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.suscripciones_plan FROM anon, authenticated;
GRANT SELECT ON public.suscripciones_plan TO authenticated;
GRANT ALL ON public.suscripciones_plan TO service_role;
CREATE POLICY suscripciones_lectura_dueno ON public.suscripciones_plan FOR SELECT TO authenticated USING (usuario_id = (SELECT auth.uid()));

-- Una única operación transaccional: el webhook repetido nunca extiende el plan otra vez.
CREATE FUNCTION public.confirmar_orden_plan(p_id uuid, p_transaccion text, p_centavos bigint, p_ambiente text, p_estado text)
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
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.confirmar_orden_plan(uuid,text,bigint,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_orden_plan(uuid,text,bigint,text,text) TO service_role;