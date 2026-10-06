-- Auditoria de seguridad (CN-001 y CN-002): lo que el vendedor puede escribir
-- DIRECTO contra PostgREST con su propio JWT. Las politicas RLS solo comprobaban
-- que la fila fuera suya; los GRANT de tabla completa dejaban escribir cualquier
-- columna.
--
-- 1. imagenes_propiedad.ruta_storage no estaba atada a nada. Un vendedor podia
--    apuntar una fila suya a la foto de OTRO vendedor (la ruta de las fotos
--    publicadas es legible) y borrarla: el trigger de limpieza encolaba esa ruta
--    y drenarLimpieza() la borraba de Storage con service_role, que se salta
--    las politicas del bucket.
--
-- 2. propiedades: slug (la aplicacion lo trata como inmutable) y creado_en eran
--    escribibles. creado_en en el futuro hace que el cron de busquedas guardadas
--    (.gt('creado_en', ultima_notificacion_en)) mande el anuncio por correo en
--    cada ejecucion a todas las busquedas que coincidan.
--
-- La proteccion de destacada/destacada_hasta y de los estados moderados va en
-- guarda_moderacion_propiedades; aqui se excluyen ademas de los grants como
-- defensa en profundidad.

-- ---------------------------------------------------------------------------
-- 1. Ruta de imagen dentro de <vendedor_id>/<propiedad_id>/
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_ruta_imagen() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_vendedor uuid;
BEGIN
  -- service_role y los fixtures de mantenimiento no pasan por aqui: el control
  -- es para quien escribe con un JWT de usuario.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  SELECT p.vendedor_id INTO v_vendedor
  FROM public.propiedades p WHERE p.id = NEW.propiedad_id;

  -- starts_with y no LIKE: los guiones bajos de una ruta no deben actuar como
  -- comodines.
  IF v_vendedor IS NULL
     OR NOT starts_with(NEW.ruta_storage, v_vendedor::text || '/' || NEW.propiedad_id::text || '/')
  THEN
    RAISE EXCEPTION 'ruta_storage debe estar dentro de la carpeta de la propiedad'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER imagenes_validar_ruta
  BEFORE INSERT OR UPDATE OF ruta_storage, propiedad_id ON public.imagenes_propiedad
  FOR EACH ROW EXECUTE FUNCTION public.validar_ruta_imagen();

-- La app solo edita alt_text y orden de una imagen existente; la ruta y la
-- propiedad se fijan al crearla y no cambian.
REVOKE UPDATE ON public.imagenes_propiedad FROM authenticated;
GRANT UPDATE (alt_text, orden) ON public.imagenes_propiedad TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Columnas de propiedades que el vendedor puede escribir
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE ON public.propiedades FROM authenticated;

-- vendedor_id y slug se fijan al crear; destacada*, creado_en y actualizado_en
-- no los toca nunca el vendedor.
GRANT INSERT (vendedor_id, slug, titulo, descripcion, operacion, tipo_inmueble,
              precio, moneda, habitaciones, banos, area_m2, barrio_id, estado)
  ON public.propiedades TO authenticated;

GRANT UPDATE (titulo, descripcion, operacion, tipo_inmueble, precio, moneda,
              habitaciones, banos, area_m2, barrio_id, estado)
  ON public.propiedades TO authenticated;
