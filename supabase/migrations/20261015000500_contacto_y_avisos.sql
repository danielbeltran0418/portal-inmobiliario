ALTER TABLE public.propiedades ADD COLUMN whatsapp_contacto text CHECK (whatsapp_contacto ~ '^573[0-9]{9}$');
GRANT SELECT (whatsapp_contacto) ON public.propiedades TO anon, authenticated;
GRANT INSERT (whatsapp_contacto), UPDATE (whatsapp_contacto) ON public.propiedades TO authenticated;
CREATE TABLE public.preferencias_notificacion (
  usuario_id uuid PRIMARY KEY REFERENCES public.perfiles(id) ON DELETE CASCADE,
  avisos_leads boolean NOT NULL DEFAULT false,
  avisos_precios boolean NOT NULL DEFAULT false
);
ALTER TABLE public.preferencias_notificacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.preferencias_notificacion FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.preferencias_notificacion TO authenticated;
GRANT ALL ON public.preferencias_notificacion TO service_role;
CREATE POLICY preferencias_dueno ON public.preferencias_notificacion TO authenticated
USING (usuario_id = (SELECT auth.uid())) WITH CHECK (usuario_id = (SELECT auth.uid()));
CREATE TABLE public.avisos_portal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  propiedad_id uuid NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('lead','precio')),
  precio_anterior numeric(14,2), precio_nuevo numeric(14,2),
  creado_en timestamptz NOT NULL DEFAULT now(),
  enviado_en timestamptz,
  bloqueo_hasta timestamptz,
  intentos integer NOT NULL DEFAULT 0
);
ALTER TABLE public.avisos_portal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avisos_portal FROM anon, authenticated;
GRANT ALL ON public.avisos_portal TO service_role;
CREATE INDEX avisos_pendientes_idx ON public.avisos_portal(creado_en) WHERE enviado_en IS NULL;
CREATE FUNCTION public.encolar_aviso_lead() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.preferencias_notificacion WHERE usuario_id = NEW.vendedor_id AND avisos_leads) THEN
    INSERT INTO public.avisos_portal(usuario_id,propiedad_id,tipo) VALUES (NEW.vendedor_id,NEW.propiedad_id,'lead');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER leads_aviso AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.encolar_aviso_lead();
CREATE FUNCTION public.encolar_aviso_precio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.estado = 'publicada' AND NEW.precio < OLD.precio THEN
    INSERT INTO public.avisos_portal(usuario_id,propiedad_id,tipo,precio_anterior,precio_nuevo)
    SELECT f.usuario_id,NEW.id,'precio',OLD.precio,NEW.precio FROM public.favoritos f
      JOIN public.preferencias_notificacion n ON n.usuario_id = f.usuario_id AND n.avisos_precios;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER propiedades_aviso_precio AFTER UPDATE OF precio ON public.propiedades
FOR EACH ROW EXECUTE FUNCTION public.encolar_aviso_precio();
CREATE FUNCTION public.reclamar_avisos_portal() RETURNS SETOF public.avisos_portal
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.avisos_portal SET bloqueo_hasta = now() + interval '10 minutes', intentos = intentos + 1
  WHERE id IN (SELECT id FROM public.avisos_portal WHERE enviado_en IS NULL AND intentos < 5
    AND (bloqueo_hasta IS NULL OR bloqueo_hasta < now()) ORDER BY creado_en FOR UPDATE SKIP LOCKED LIMIT 30)
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.encolar_aviso_lead(), public.encolar_aviso_precio(), public.reclamar_avisos_portal() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_avisos_portal() TO service_role;