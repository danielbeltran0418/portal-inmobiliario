-- ============================================================================
-- Zona aproximada de un inmueble, para el mapa de la ficha publica.
--
-- latitud/longitud viven en propiedades_ubicacion, que el publico NO puede leer
-- (20260914000100). Esta funcion es la unica salida publica de esos datos, y
-- nunca devuelve el punto: devuelve el CENTRO de la celda de 0.005 grados
-- (~550 m de lado) que lo contiene. La ficha pinta un circulo de 500 m
-- alrededor (src/lib/mapa/zona.ts), que siempre cubre el inmueble (la media
-- diagonal de la celda es ~390 m) sin permitir deducir donde esta.
--
-- Solo para propiedades PUBLICADAS: un borrador no tiene ficha publica.
-- SECURITY DEFINER para poder leer la tabla privada; el redondeo ocurre aqui
-- dentro, asi que el punto exacto no cruza la frontera de la base.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.zona_aproximada_propiedad(p_propiedad_id uuid)
RETURNS TABLE (latitud double precision, longitud double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT floor(u.latitud / 0.005) * 0.005 + 0.0025,
         floor(u.longitud / 0.005) * 0.005 + 0.0025
  FROM public.propiedades_ubicacion u
  JOIN public.propiedades p ON p.id = u.propiedad_id
  WHERE u.propiedad_id = p_propiedad_id
    AND p.estado = 'publicada'
    AND u.latitud IS NOT NULL
    AND u.longitud IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.zona_aproximada_propiedad(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zona_aproximada_propiedad(uuid) TO anon, authenticated, service_role;

-- Coordenadas en rango: ninguna escritura puede guardar un punto imposible.
-- NOT VALID: no revisa filas antiguas, solo las nuevas o modificadas.
ALTER TABLE public.propiedades_ubicacion
  ADD CONSTRAINT propiedades_ubicacion_coordenadas_validas CHECK (
    (latitud IS NULL AND longitud IS NULL)
    OR (latitud BETWEEN -90 AND 90 AND longitud BETWEEN -180 AND 180)
  ) NOT VALID;
