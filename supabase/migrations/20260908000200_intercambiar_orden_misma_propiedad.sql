-- ============================================================================
-- Corrige intercambiar_orden_imagenes (20260908000100): no verificaba que
-- las dos imagenes pertenecieran a la MISMA propiedad.
--
-- EL HALLAZGO
-- ----------------------------------------------------------------------------
-- La version anterior solo comprobaba, fila por fila, que RLS dejaba ver/
-- editar cada imagen (orden_1 IS NULL OR orden_2 IS NULL). Eso implementa
-- "esta imagen, por separado, es de una propiedad tuya" -- NUNCA "las dos
-- imagenes son de la MISMA propiedad". Un vendedor dueno de dos propiedades
-- distintas puede pasar una imagen de cada una: ambas superan el chequeo de
-- RLS (las dos son suyas), y la funcion intercambia sus `orden` sin queja,
-- aunque pertenezcan a filas de `propiedad_id` distintos.
--
-- Reproducido contra la base real: vendedor dueno de propiedad X (imagen con
-- orden 7) y propiedad Y (imagen con orden 1); tras invocar el RPC con una
-- imagen de cada una, X quedo con orden 1 e Y con orden 7 -- exactamente el
-- estado indeterminado/duplicado dentro de una propiedad que esta funcion
-- existia para evitar, solo que producido por una via distinta.
--
-- `reordenarImagen()` (acciones-imagenes.ts) nunca arma ese par: la "vecina"
-- sale siempre de la lista ya filtrada por `propiedad_id`. El vector real es
-- invocar el RPC directamente -- cualquier `authenticated` puede hacerlo via
-- PostgREST (GRANT EXECUTE ... TO authenticated, ya en la migracion previa).
--
-- LA CORRECCION
-- ----------------------------------------------------------------------------
-- Los dos SELECT ... FOR UPDATE que ya existian traen la fila completa: basta
-- con capturar tambien `propiedad_id` de cada una (antes solo se leia
-- `orden`) y comparar. Se mantiene el mismo tipo de excepcion que ya usa el
-- chequeo de "no es tuya" (ERRCODE 42501, RAISE EXCEPTION dentro de la misma
-- funcion SECURITY INVOKER) con un mensaje propio que nombra el problema
-- real: no es una cuestion de propiedad/autorizacion via RLS, es que las
-- filas nunca debieron compararse porque son de propiedades distintas.
-- Este chequeo va DESPUES del de "no existe o no es tuya" (orden_N IS NULL)
-- y ANTES de cualquier UPDATE: si cualquiera de las dos imagenes no es
-- visible, ese sigue siendo el motivo que se reporta primero.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.intercambiar_orden_imagenes(
  p_imagen_id_1 uuid,
  p_imagen_id_2 uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  orden_1        smallint;
  orden_2        smallint;
  propiedad_id_1 uuid;
  propiedad_id_2 uuid;
  filas          integer;
BEGIN
  IF p_imagen_id_1 = p_imagen_id_2 THEN
    RETURN;
  END IF;

  SELECT orden, propiedad_id INTO orden_1, propiedad_id_1 FROM public.imagenes_propiedad
    WHERE id = p_imagen_id_1 FOR UPDATE;
  SELECT orden, propiedad_id INTO orden_2, propiedad_id_2 FROM public.imagenes_propiedad
    WHERE id = p_imagen_id_2 FOR UPDATE;

  -- NULL cubre dos casos que aqui se tratan igual, como en el resto del
  -- proyecto: la imagen no existe, o existe pero RLS la esconde para este
  -- invocador. No hay forma de distinguirlos desde SQL sin saltar RLS, y
  -- distinguirlos no le serviria de nada a quien llama.
  IF orden_1 IS NULL OR orden_2 IS NULL THEN
    RAISE EXCEPTION 'No se puede reordenar: una de las imagenes no existe o no es tuya'
      USING ERRCODE = '42501';
  END IF;

  -- EL HALLAZGO: ambas imagenes pueden ser "tuyas" via RLS y aun asi
  -- pertenecer a propiedades distintas. Intercambiar su `orden` en ese caso
  -- no es un problema de autorizacion (ninguna fila cambia de dueno) pero
  -- reabre, cruzando propiedades, el mismo estado indeterminado/duplicado
  -- que esta funcion existe para evitar dentro de una propiedad.
  IF propiedad_id_1 <> propiedad_id_2 THEN
    RAISE EXCEPTION 'No se puede reordenar: las imagenes pertenecen a propiedades distintas'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.imagenes_propiedad SET orden = orden_2 WHERE id = p_imagen_id_1;
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 1 THEN
    RAISE EXCEPTION 'No se pudo actualizar el orden de la imagen %', p_imagen_id_1
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.imagenes_propiedad SET orden = orden_1 WHERE id = p_imagen_id_2;
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 1 THEN
    RAISE EXCEPTION 'No se pudo actualizar el orden de la imagen %', p_imagen_id_2
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- CREATE OR REPLACE conserva los privilegios existentes porque la firma
-- (uuid, uuid) no cambia, pero se deja explicito otra vez -- mismo criterio
-- de "defensa en profundidad" que ya documenta 20260908000100 -- en vez de
-- confiar en que la herencia implicita sobreviva a un futuro reemplazo de
-- esta funcion.
REVOKE EXECUTE ON FUNCTION public.intercambiar_orden_imagenes(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intercambiar_orden_imagenes(uuid, uuid)
  TO authenticated;
