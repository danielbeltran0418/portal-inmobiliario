-- Auditoria de seguridad (H1): la moderacion del super_admin no se podia
-- sostener. 20261007000100 da al vendedor UPDATE sobre `estado` y su
-- comentario remitia a un trigger guarda_moderacion_propiedades que nunca
-- llego a ninguna migracion. Resultado: un anuncio que el super_admin pasaba a
-- 'rechazada' volvia al catalogo con el boton "Publicar" del propio panel, o
-- con un UPDATE directo contra PostgREST.
--
-- Estados moderados: 'rechazada' y 'en_revision'. Solo el super_admin (o el
-- sistema) los pone y los quita. El vendedor puede seguir editando los datos
-- de un anuncio rechazado y borrarlo; lo que no puede es cambiarle el estado.
--
-- destacada/destacada_hasta no se tocan aqui: el vendedor no tiene GRANT sobre
-- esas columnas (20261007000100) y las escribe sincronizar_destacadas_trigger,
-- que es SECURITY DEFINER y por tanto no corre como 'authenticated'.

CREATE OR REPLACE FUNCTION public.guarda_moderacion_propiedades() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- service_role, los SECURITY DEFINER del sistema y los fixtures no pasan por
  -- aqui: el control es para quien escribe con un JWT de usuario. Mismo
  -- criterio que validar_ruta_imagen (20261007000100).
  IF current_user NOT IN ('authenticated', 'anon') OR public.es_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado IN ('rechazada', 'en_revision') THEN
      RAISE EXCEPTION 'Solo la moderacion asigna ese estado'
        USING ERRCODE = 'PR001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND (OLD.estado IN ('rechazada', 'en_revision')
          OR NEW.estado IN ('rechazada', 'en_revision'))
  THEN
    RAISE EXCEPTION 'El estado de una propiedad moderada solo lo cambia la moderacion'
      USING ERRCODE = 'PR001';
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.guarda_moderacion_propiedades() FROM PUBLIC, anon, authenticated;

-- El nombre empieza por 'propiedades_a': los triggers BEFORE se disparan por
-- orden alfabetico y este tiene que ir antes que propiedades_exigir_imagen y
-- propiedades_exigir_precio, para que un intento de republicar un anuncio
-- rechazado reciba PR001 y no un 23514 que lo mande a "te falta una foto".
CREATE TRIGGER propiedades_a_guarda_moderacion
  BEFORE INSERT OR UPDATE OF estado ON public.propiedades
  FOR EACH ROW EXECUTE FUNCTION public.guarda_moderacion_propiedades();
