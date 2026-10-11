CREATE FUNCTION public.limitar_fotos_basico() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_dueno uuid; v_estado public.estado_propiedad;
BEGIN
  IF NOT coalesce((SELECT planes_activos FROM public.configuracion_comercial WHERE singleton),false) THEN RETURN NEW; END IF;
  SELECT vendedor_id,estado INTO v_dueno,v_estado FROM public.propiedades WHERE id=NEW.propiedad_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_dueno::text,0));
  IF v_estado='publicada' AND NOT EXISTS(SELECT 1 FROM public.suscripciones_plan WHERE usuario_id=v_dueno AND vigente_hasta>now())
    AND (SELECT count(*) FROM public.imagenes_propiedad WHERE propiedad_id=NEW.propiedad_id AND id<>NEW.id)>=8 THEN
    RAISE EXCEPTION 'El plan básico admite ocho fotos' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.limitar_fotos_basico() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER imagenes_limite_plan BEFORE INSERT OR UPDATE OF propiedad_id ON public.imagenes_propiedad
FOR EACH ROW EXECUTE FUNCTION public.limitar_fotos_basico();
CREATE TABLE public.equipo_miembros (
  propietario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agente_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY(propietario_id,agente_id), CHECK(propietario_id<>agente_id)
);
CREATE TABLE public.equipo_invitaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  propietario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  correo text NOT NULL CHECK(length(correo)<=254),
  token_hash text UNIQUE NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  vence_en timestamptz NOT NULL DEFAULT now()+interval '2 days',
  aceptada boolean NOT NULL DEFAULT false
);
ALTER TABLE public.equipo_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipo_invitaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.equipo_miembros,public.equipo_invitaciones FROM anon,authenticated;
GRANT SELECT ON public.equipo_miembros TO authenticated;
GRANT ALL ON public.equipo_miembros,public.equipo_invitaciones TO service_role;
CREATE POLICY miembros_lectura ON public.equipo_miembros FOR SELECT TO authenticated
USING(propietario_id=(SELECT auth.uid()) OR agente_id=(SELECT auth.uid()));
CREATE FUNCTION public.aceptar_equipo(p_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_inv public.equipo_invitaciones; v_correo text;
BEGIN
  IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'rol','')<>'vendedor' THEN RETURN false; END IF;
  SELECT email INTO v_correo FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
  SELECT * INTO v_inv FROM public.equipo_invitaciones WHERE token_hash=p_hash AND NOT aceptada AND vence_en>now() FOR UPDATE;
  IF NOT FOUND OR lower(v_inv.correo)<>lower(v_correo) OR v_correo IS NULL OR v_inv.propietario_id=auth.uid() THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.suscripciones_plan WHERE usuario_id=v_inv.propietario_id AND plan='pro' AND vigente_hasta>now()) THEN RETURN false; END IF;
  INSERT INTO public.equipo_miembros VALUES(v_inv.propietario_id,auth.uid()) ON CONFLICT DO NOTHING;
  UPDATE public.equipo_invitaciones SET aceptada=true WHERE id=v_inv.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.aceptar_equipo(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aceptar_equipo(text) TO authenticated;
-- Resumen agregado del equipo: no concede acceso a borradores, dirección ni contactos de terceros.
CREATE FUNCTION public.resumen_equipo() RETURNS TABLE(agente_id uuid,publicaciones bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
WITH titulares AS (
  SELECT s.usuario_id FROM public.suscripciones_plan s WHERE s.plan='pro' AND s.vigente_hasta>now()
    AND (s.usuario_id=auth.uid() OR EXISTS(SELECT 1 FROM public.equipo_miembros m WHERE m.propietario_id=s.usuario_id AND m.agente_id=auth.uid()))
), agentes AS (
  SELECT usuario_id AS id FROM titulares UNION SELECT m.agente_id FROM public.equipo_miembros m JOIN titulares t ON t.usuario_id=m.propietario_id
)
SELECT a.id,count(p.id) FROM agentes a LEFT JOIN public.propiedades p ON p.vendedor_id=a.id
  AND p.estado='publicada' AND (p.publicada_hasta IS NULL OR p.publicada_hasta>now()) GROUP BY a.id;
$$;
REVOKE ALL ON FUNCTION public.resumen_equipo() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resumen_equipo() TO authenticated;