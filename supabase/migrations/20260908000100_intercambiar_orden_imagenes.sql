-- ============================================================================
-- intercambiar_orden_imagenes: swap atomico del campo `orden` entre dos filas
-- de imagenes_propiedad.
--
-- EL RIESGO QUE RESUELVE (Task 10, brief original)
-- ----------------------------------------------------------------------------
-- El brief proponia reordenar con DOS UPDATE secuenciales desde el server
-- action, cada uno su propia llamada a PostgREST (su propia transaccion):
--
--   await supabase.from('imagenes_propiedad').update({ orden: b.orden }).eq('id', a.id)
--   await supabase.from('imagenes_propiedad').update({ orden: a.orden }).eq('id', b.id)
--
-- Si el primero se confirma y el segundo falla (perdida de conexion, el
-- proceso muere, un timeout), las dos filas quedan con el MISMO `orden`: el
-- listado se vuelve indeterminista (el orden entre esas dos fotos depende de
-- como desempate Postgres, y puede cambiar entre lecturas). No es un agujero
-- de seguridad -- ninguna fila cambia de dueno ni de propiedad -- pero es un
-- estado a medio camino que el diseno original no podia deshacer ni evitar.
--
-- LA SOLUCION: una funcion, no dos llamadas
-- ----------------------------------------------------------------------------
-- Una funcion invocada por RPC es UNA sola sentencia de nivel superior para
-- PostgREST, y por tanto UNA sola transaccion implicita de Postgres. Los dos
-- UPDATE de abajo corren dentro de esa misma transaccion: si el segundo
-- lanza una excepcion, Postgres deshace TAMBIEN el primero antes de que
-- ninguno llegue a verse. No hace falta BEGIN/COMMIT explicito (no se puede,
-- ademas, dentro de una funcion invocada como sentencia unica) ni una tabla
-- de coordinacion aparte: la atomicidad la da gratis la semantica de
-- invocacion de funciones de PostgreSQL.
--
-- SECURITY INVOKER, no DEFINER -- a proposito, y al reves que casi toda
-- funcion de este esquema
-- ----------------------------------------------------------------------------
-- Todas las funciones plpgsql existentes (encolar_limpieza_imagen,
-- registrar_intento_login, etc.) son SECURITY DEFINER porque necesitan
-- escribir en tablas a las que el rol de aplicacion no tiene acceso directo.
-- Aqui es justo lo contrario: SE QUIERE que la funcion corra con los
-- privilegios y la RLS del invocador, porque la autorizacion que hace falta
-- --"estas dos imagenes son de una propiedad tuya"-- YA la implementan las
-- politicas imagenes_actualizacion_dueno (dueno) e
-- imagenes_actualizacion_super_admin (moderacion), ambas con WITH CHECK
-- explicito desde 20260831000200 / 20260831000600. Reimplementar ese
-- chequeo a mano dentro de la funcion (con SECURITY DEFINER) duplicaria una
-- regla de autorizacion en dos sitios que podrian desincronizarse con el
-- tiempo. Con SECURITY INVOKER, el vendedor B que intente intercambiar el
-- orden de una imagen del vendedor A choca con la MISMA politica RLS que ya
-- protege un UPDATE directo -- se prueba en tests/rls/acciones-imagenes.test.ts.
--
-- Los dos SELECT usan FOR UPDATE: no solo bloquean la fila (dos llamadas
-- concurrentes a esta funcion sobre las mismas imagenes se serializan en vez
-- de pisarse), sino que ademas, al ser un SELECT dentro de una politica RLS,
-- el bloqueo FOR UPDATE se evalua contra las politicas de UPDATE/DELETE (no
-- solo las de SELECT) -- asi que una imagen visible por lectura publica pero
-- no editable por el invocador ya sale con `orden` NULL aqui, antes de
-- intentar ningun UPDATE.
--
-- GET DIAGNOSTICS ... ROW_COUNT tras cada UPDATE: si alguna de las dos filas
-- queda fuera del predicado de la politica (no es tuya y no eres
-- super_admin), el UPDATE de PostgreSQL no lanza error -- sencillamente no
-- afecta ninguna fila, el mismo comportamiento silencioso que ya documenta
-- el resto del proyecto ("RLS deniega filtrando filas: cero filas significa
-- que no es tuya"). Sin este chequeo, la funcion devolveria exito aunque no
-- hubiera cambiado nada. Se convierte esa denegacion silenciosa en una
-- excepcion (42501) para que el intercambio sea todo-o-nada tambien frente a
-- RLS, no solo frente a fallos de red.
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
  orden_1 smallint;
  orden_2 smallint;
  filas   integer;
BEGIN
  IF p_imagen_id_1 = p_imagen_id_2 THEN
    RETURN;
  END IF;

  SELECT orden INTO orden_1 FROM public.imagenes_propiedad
    WHERE id = p_imagen_id_1 FOR UPDATE;
  SELECT orden INTO orden_2 FROM public.imagenes_propiedad
    WHERE id = p_imagen_id_2 FOR UPDATE;

  -- NULL cubre dos casos que aqui se tratan igual, como en el resto del
  -- proyecto: la imagen no existe, o existe pero RLS la esconde para este
  -- invocador. No hay forma de distinguirlos desde SQL sin saltar RLS, y
  -- distinguirlos no le serviria de nada a quien llama.
  IF orden_1 IS NULL OR orden_2 IS NULL THEN
    RAISE EXCEPTION 'No se puede reordenar: una de las imagenes no existe o no es tuya'
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

-- Postgres concede EXECUTE a PUBLIC por defecto en toda funcion nueva (mismo
-- hallazgo que documentan 20260831000100/000500/000700 para los otros RPC de
-- este esquema). Aunque esta funcion es SECURITY INVOKER -- no hay privilegio
-- elevado que filtrar-- se revoca igual por consistencia y defensa en
-- profundidad: sin GRANT UPDATE de tabla, anon ya no podria hacer nada util
-- con ella (chocaria con "permission denied for table" antes que con RLS),
-- pero que quede explicito en vez de heredado en silencio.
REVOKE EXECUTE ON FUNCTION public.intercambiar_orden_imagenes(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intercambiar_orden_imagenes(uuid, uuid)
  TO authenticated;
