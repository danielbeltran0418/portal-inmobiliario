CREATE OR REPLACE FUNCTION public.validar_nueva_orden_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.usuario_id::text,0));
  IF EXISTS(SELECT 1 FROM public.suscripciones_plan WHERE usuario_id=NEW.usuario_id AND vigente_hasta>now() AND plan<>NEW.plan) THEN
    RAISE EXCEPTION 'Cambio de plan pendiente de vencimiento' USING ERRCODE='check_violation';
  END IF;
  IF NEW.plan='destacado' AND (SELECT count(*) FROM public.propiedades WHERE vendedor_id=NEW.usuario_id AND estado='publicada' AND (publicada_hasta IS NULL OR publicada_hasta>now()))>5 THEN
    RAISE EXCEPTION 'Destacado admite cinco publicaciones activas' USING ERRCODE='check_violation';
  END IF;
  IF (SELECT count(*) FROM public.ordenes_plan WHERE usuario_id=NEW.usuario_id AND creado_en>now()-interval '30 minutes')>=5 THEN
    RAISE EXCEPTION 'Demasiadas órdenes recientes' USING ERRCODE='check_violation';
  END IF;
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
    IF EXISTS(SELECT 1 FROM public.suscripciones_plan WHERE usuario_id=v_orden.usuario_id AND vigente_hasta>now() AND plan<>v_orden.plan) OR (v_orden.plan='destacado' AND (SELECT count(*) FROM public.propiedades WHERE vendedor_id=v_orden.usuario_id AND estado='publicada' AND (publicada_hasta IS NULL OR publicada_hasta>now()))>5) THEN
      UPDATE public.ordenes_plan SET requiere_revision=true WHERE id=p_id;
      RETURN true;
    END IF;
    SELECT greatest(now(), vigente_hasta) INTO v_desde FROM public.suscripciones_plan WHERE usuario_id = v_orden.usuario_id;
    INSERT INTO public.suscripciones_plan(usuario_id, plan, orden_id, vigente_hasta)
      VALUES (v_orden.usuario_id, v_orden.plan, p_id, coalesce(v_desde, now()) + CASE WHEN v_orden.periodo = 'anual' THEN interval '1 year' ELSE interval '1 month' END)
      ON CONFLICT (usuario_id) DO UPDATE SET plan = EXCLUDED.plan, orden_id = EXCLUDED.orden_id, vigente_hasta = EXCLUDED.vigente_hasta;
    UPDATE public.propiedades SET prioridad_plan = CASE v_orden.plan WHEN 'pro' THEN 2 ELSE 1 END, publicada_hasta = (SELECT vigente_hasta FROM public.suscripciones_plan WHERE usuario_id = v_orden.usuario_id) WHERE vendedor_id = v_orden.usuario_id AND estado = 'publicada';
  END IF;
  RETURN true;
END $$;
