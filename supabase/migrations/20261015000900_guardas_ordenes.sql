CREATE FUNCTION public.validar_nueva_orden_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.usuario_id::text,0));
  IF EXISTS(SELECT 1 FROM public.suscripciones_plan WHERE usuario_id=NEW.usuario_id AND vigente_hasta>now() AND plan<>NEW.plan) THEN
    RAISE EXCEPTION 'Cambio de plan pendiente de vencimiento' USING ERRCODE='check_violation';
  END IF;
  IF (SELECT count(*) FROM public.ordenes_plan WHERE usuario_id=NEW.usuario_id AND creado_en>now()-interval '30 minutes')>=5 THEN
    RAISE EXCEPTION 'Demasiadas órdenes recientes' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validar_nueva_orden_plan() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ordenes_validacion BEFORE INSERT ON public.ordenes_plan
FOR EACH ROW EXECUTE FUNCTION public.validar_nueva_orden_plan();