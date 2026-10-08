-- Auditoria de seguridad (control 20, registros y alertas): un cambio de rol
-- -- p. ej. convertir una cuenta en super_admin -- no dejaba rastro. La
-- aplicacion nunca cambia roles (bloquear_cambio_rol, 20260827000200): solo
-- se hacen por SQL con service_role o desde el panel de Supabase, que es
-- justo lo que mas importa poder reconstruir despues.
--
-- Se registra en registro_auditoria (visible en /control/auditoria) como
-- 'rol_cambiado', con el rol anterior y el nuevo. actor_id es quien lo hizo
-- si lo hizo con un JWT de usuario; con service_role o SQL directo queda nulo
-- y metadatos.via dice por donde entro.

CREATE OR REPLACE FUNCTION public.auditar_cambio_de_rol() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.registrar_evento_auditoria(
    'rol_cambiado',
    'perfiles',
    NEW.id,
    auth.uid(),
    jsonb_build_object(
      'rol_anterior', OLD.rol::text,
      'rol_nuevo',    NEW.rol::text,
      'via',          coalesce(auth.role(), session_user::text)
    ),
    NULL
  );
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.auditar_cambio_de_rol() FROM PUBLIC;

CREATE TRIGGER perfiles_auditar_cambio_de_rol
  AFTER UPDATE OF rol ON public.perfiles
  FOR EACH ROW
  WHEN (OLD.rol IS DISTINCT FROM NEW.rol)
  EXECUTE FUNCTION public.auditar_cambio_de_rol();
