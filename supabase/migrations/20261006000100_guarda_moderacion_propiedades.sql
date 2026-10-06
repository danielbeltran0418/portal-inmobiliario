-- CN-001 (auditoria Cyber Neo 2026-10-06). authenticated tiene UPDATE sobre
-- toda la tabla (20260827000600) y propiedades_actualizacion_dueno solo mira
-- vendedor_id, asi que el vendedor podia:
--   * sacar de 'rechazada' una propiedad que el super_admin suspendio y
--     volver a publicarla, sin pasar por la moderacion;
--   * marcarse destacada / destacada_hasta, que es posicionamiento de pago.
-- Va en la base y no solo en cambiarEstado() porque PostgREST esta expuesto:
-- un PATCH directo con el JWT del vendedor se salta la aplicacion.
--
-- Por que un trigger y no permisos por columna: 'estado' tiene que seguir
-- siendo escribible por el dueno (publicar, pausar, vendida); lo prohibido es
-- una TRANSICION concreta, y eso no se expresa con GRANT UPDATE (col).
--
-- Quien queda fuera de la guarda:
--   * super_admin, que es quien modera (suspenderPropiedad / reactivarPropiedad
--     usan su sesion, no service_role);
--   * cualquier current_user que no sea authenticated/anon: service_role y las
--     funciones SECURITY DEFINER. sincronizar_destacadas_trigger() es la que
--     escribe destacada a partir de pagos_posicionamiento, y corre como su
--     dueno: por eso la funcion de abajo NO es SECURITY DEFINER, necesita ver
--     el current_user real de quien escribe.
CREATE OR REPLACE FUNCTION public.guardar_moderacion_propiedad() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.es_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.destacada OR NEW.destacada_hasta IS NOT NULL THEN
      RAISE EXCEPTION 'El posicionamiento destacado solo lo asigna la administracion'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.estado = 'rechazada'::public.estado_propiedad THEN
      RAISE EXCEPTION 'Solo la administracion puede rechazar una propiedad'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.destacada IS DISTINCT FROM OLD.destacada
     OR NEW.destacada_hasta IS DISTINCT FROM OLD.destacada_hasta
  THEN
    RAISE EXCEPTION 'El posicionamiento destacado solo lo asigna la administracion'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND (OLD.estado = 'rechazada'::public.estado_propiedad
          OR NEW.estado = 'rechazada'::public.estado_propiedad)
  THEN
    RAISE EXCEPTION 'Una propiedad suspendida solo la puede reactivar la administracion'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END $$;

-- Trampa 6 de docs/ESTADO-Y-GUIA.md: Postgres concede EXECUTE a PUBLIC en toda
-- funcion nueva. Un trigger no necesita EXECUTE del que escribe para dispararse.
REVOKE EXECUTE ON FUNCTION public.guardar_moderacion_propiedad() FROM PUBLIC;

CREATE TRIGGER propiedades_guardar_moderacion
  BEFORE INSERT OR UPDATE ON public.propiedades
  FOR EACH ROW EXECUTE FUNCTION public.guardar_moderacion_propiedad();
