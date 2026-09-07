-- Unica excepcion a "publicacion directa": una ficha sin fotos no sirve en un
-- portal inmobiliario y es la que mas dana el catalogo que construira el SP1.
-- Va en la base y no solo en el formulario porque PostgREST esta expuesto: un
-- PATCH directo se saltaria cualquier validacion de la aplicacion.
CREATE OR REPLACE FUNCTION public.exigir_imagen_para_publicar() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.estado = 'publicada'::public.estado_propiedad
     AND (TG_OP = 'INSERT'
          OR OLD.estado IS DISTINCT FROM 'publicada'::public.estado_propiedad)
     AND NOT EXISTS (
       SELECT 1 FROM public.imagenes_propiedad i WHERE i.propiedad_id = NEW.id
     )
  THEN
    RAISE EXCEPTION 'Una propiedad publicada necesita al menos una imagen'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER propiedades_exigir_imagen
  BEFORE INSERT OR UPDATE ON public.propiedades
  FOR EACH ROW EXECUTE FUNCTION public.exigir_imagen_para_publicar();
