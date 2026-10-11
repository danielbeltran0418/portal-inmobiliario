ALTER TABLE public.preferencias_notificacion ADD COLUMN avisos_leads_whatsapp boolean NOT NULL DEFAULT false;
GRANT SELECT(avisos_leads_whatsapp),INSERT(avisos_leads_whatsapp),UPDATE(avisos_leads_whatsapp) ON public.preferencias_notificacion TO authenticated;
ALTER TABLE public.avisos_portal ADD COLUMN canal text NOT NULL DEFAULT 'correo' CHECK(canal IN ('correo','whatsapp'));
CREATE OR REPLACE FUNCTION public.encolar_aviso_lead() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.preferencias_notificacion WHERE usuario_id=NEW.vendedor_id AND avisos_leads) THEN
    INSERT INTO public.avisos_portal(usuario_id,propiedad_id,tipo,canal) VALUES(NEW.vendedor_id,NEW.propiedad_id,'lead','correo');
  END IF;
  IF EXISTS(SELECT 1 FROM public.preferencias_notificacion WHERE usuario_id=NEW.vendedor_id AND avisos_leads_whatsapp) THEN
    INSERT INTO public.avisos_portal(usuario_id,propiedad_id,tipo,canal) VALUES(NEW.vendedor_id,NEW.propiedad_id,'lead','whatsapp');
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION public.reclamar_avisos_portal(p_whatsapp boolean) RETURNS SETOF public.avisos_portal
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  UPDATE public.avisos_portal SET bloqueo_hasta=now()+interval '10 minutes',intentos=intentos+1
  WHERE id IN(SELECT id FROM public.avisos_portal WHERE enviado_en IS NULL AND intentos<5 AND (canal='correo' OR p_whatsapp)
    AND (bloqueo_hasta IS NULL OR bloqueo_hasta<now()) ORDER BY creado_en FOR UPDATE SKIP LOCKED LIMIT 30) RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.reclamar_avisos_portal(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_avisos_portal(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.reclamar_avisos_portal() RETURNS SETOF public.avisos_portal
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT * FROM public.reclamar_avisos_portal(false); $$;