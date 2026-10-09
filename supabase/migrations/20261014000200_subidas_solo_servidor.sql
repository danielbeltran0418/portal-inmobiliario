-- Auditoria de seguridad (L2): el vendedor podia escribir en el bucket
-- 'propiedades' con su propio JWT, sin pasar por subirImagen(). Asi la foto
-- no pasaba por sharp (src/lib/imagenes/procesar.ts): conservaba el EXIF --
-- incluida la posicion GPS, que el portal oculta a proposito
-- (20260914000100_ubicacion_privada.sql) -- y el tope de fotos por propiedad
-- solo existia en la aplicacion.
--
-- 1. Sin politica de INSERT para authenticated en el bucket: solo el servidor
--    sube, con service_role, despues de comprobar que la propiedad es de quien
--    la pide y de reprocesar la imagen. Lectura y borrado de la carpeta propia
--    no cambian (eliminarImagen borra como el vendedor).
--
-- 2. Tope de 12 fotos por propiedad en la base (MAXIMO_IMAGENES_POR_PROPIEDAD
--    en procesar.ts), con un bloqueo por propiedad para que dos subidas a la
--    vez no lo sobrepasen.

DROP POLICY IF EXISTS storage_propiedades_escritura ON storage.objects;

CREATE OR REPLACE FUNCTION public.limitar_imagenes_por_propiedad() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('imagenes_propiedad:' || NEW.propiedad_id::text, 0));
  IF (SELECT count(*) FROM public.imagenes_propiedad WHERE propiedad_id = NEW.propiedad_id) >= 12 THEN
    RAISE EXCEPTION 'Una propiedad admite como maximo 12 fotos'
      USING ERRCODE = 'IM001';
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.limitar_imagenes_por_propiedad() FROM PUBLIC;

CREATE TRIGGER imagenes_limitar_por_propiedad
  BEFORE INSERT ON public.imagenes_propiedad
  FOR EACH ROW EXECUTE FUNCTION public.limitar_imagenes_por_propiedad();
