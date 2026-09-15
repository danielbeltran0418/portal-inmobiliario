-- ============================================================================
-- SP5: franjas calculadas. No se guardan: se derivan del horario semanal, las
-- fechas bloqueadas y las citas confirmadas.
--
-- ZONA HORARIA. La base corre en UTC y asi se queda. La hora de pared del
-- vendedor se convierte a instante AQUI, con la zona nombrada:
--
--   (fecha + hora)::timestamp AT TIME ZONE 'America/Bogota'   -> timestamptz
--       interpreta la hora como hora de Bogota. ESTA genera franjas.
--   instante_tz AT TIME ZONE 'America/Bogota'                  -> timestamp
--       convierte un instante a hora de Bogota. Esta saca la fecha local.
--
-- Invertirlas da las 10:00 UTC donde deberian ser las 20:00 (verificado:
-- jueves 2026-09-17 15:00 -> 20:00 UTC con la correcta, 10:00 UTC invertida,
-- 15:00 UTC sin conversion). date + time da timestamp sin zona, asi que el
-- resultado no depende del TimeZone de la sesion.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Generador interno. Una unica fuente para listar y para validar.
--
-- Dos limites distintos, y no son redundantes:
--   * Los de las FECHAS (greatest/least con now() y now() + 15 days) solo
--     acotan generate_series: sin ellos, p_hasta = 'infinity' o el ano 3000
--     generaria series enormes. No son la regla de negocio.
--   * El HORIZONTE es el WHERE final: now() + 2 hours <= inicio <= now() +
--     14 days. Es lo que la prueba falsifica.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.franjas_candidatas(
  p_vendedor_id uuid, p_desde timestamptz, p_hasta timestamptz
) RETURNS TABLE (inicio timestamptz)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH limites AS (
    SELECT
      (greatest(p_desde, now()) AT TIME ZONE 'America/Bogota')::date                    AS primera,
      (least(p_hasta, now() + interval '15 days') AT TIME ZONE 'America/Bogota')::date AS ultima
  ),
  dias AS (
    -- ::timestamp explicito en los dos extremos: generate_series(date, date, ...)
    -- resolveria a la variante timestamptz y dependeria del TimeZone de la sesion.
    SELECT g::date AS fecha
    FROM limites,
         generate_series(limites.primera::timestamp, limites.ultima::timestamp, interval '1 day') AS g
  ),
  generadas AS (
    SELECT DISTINCT
      ((dias.fecha + d.hora_inicio) + make_interval(hours => h.desplazamiento))
        AT TIME ZONE 'America/Bogota' AS inicio
    FROM dias
    JOIN public.disponibilidad_semanal d
      ON d.vendedor_id = p_vendedor_id
     AND d.dia_semana = extract(isodow FROM dias.fecha)::int
    CROSS JOIN LATERAL generate_series(
      0,
      (extract(hour FROM d.hora_fin) - extract(hour FROM d.hora_inicio))::int - 1
    ) AS h(desplazamiento)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.fechas_bloqueadas b
      WHERE b.vendedor_id = p_vendedor_id
        AND dias.fecha BETWEEN b.desde AND b.hasta
    )
  )
  SELECT generadas.inicio
  FROM generadas
  WHERE generadas.inicio >= now() + interval '2 hours'
    AND generadas.inicio <= now() + interval '14 days'
  ORDER BY generadas.inicio;
$$;

-- ----------------------------------------------------------------------------
-- Validacion de UNA franja: existe entre las candidatas de su dia. Cubre a la
-- vez disponibilidad, bloqueo, horizonte y "empieza en punto" (una hora que no
-- esta en punto no coincide con ninguna candidata).
--
-- NO mira si esta ocupada: eso lo hace cumplir la restriccion de exclusion al
-- escribir, que es la unica comprobacion que aguanta peticiones simultaneas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.franja_valida(p_vendedor_id uuid, p_inicio timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT p_inicio IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.franjas_candidatas(p_vendedor_id, p_inicio, p_inicio) AS f
    WHERE f.inicio = p_inicio
  );
$$;

-- ----------------------------------------------------------------------------
-- Lectura publica de franjas.
--
-- SECURITY DEFINER porque tiene que excluir las franjas ocupadas por citas de
-- OTROS compradores, que quien llama no puede leer. No contradice el rechazo
-- del RPC de lectura en SP4 (20260911000300): alli el RPC habria protegido un
-- dato, el contacto, que el vendedor seguia leyendo por la tabla. Aqui la
-- funcion devuelve un dato DERIVADO y no protegido -- horas libres -- y nunca
-- dice quien ocupa las demas.
--
-- Quien llama: el propio vendedor; un comprador con un lead ACEPTADO de ese
-- vendedor; o service_role (la costura con SP6, ver la cabecera de la Tarea 3
-- del plan). Cualquier otro recibe un conjunto vacio, no un error: no se le
-- confirma siquiera que el vendedor exista.
--
-- leads.vendedor_id esta desnormalizado y sincronizar_vendedor_lead() deja los
-- 'aceptado' con el vendedor que los acepto: la comprobacion usa ese valor.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.franjas_libres(
  p_vendedor_id uuid, p_desde timestamptz, p_hasta timestamptz
) RETURNS TABLE (inicio timestamptz, fin timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR (v_actor IS NOT NULL AND v_actor = p_vendedor_id)
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.comprador_id = v_actor
        AND l.vendedor_id = p_vendedor_id
        AND l.estado = 'aceptado'
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT f.inicio, f.inicio + interval '60 minutes'
  FROM public.franjas_candidatas(p_vendedor_id, p_desde, p_hasta) AS f
  WHERE NOT EXISTS (
    SELECT 1 FROM public.citas c
    WHERE c.vendedor_id = p_vendedor_id
      AND c.estado = 'confirmada'
      AND c.rango && tstzrange(f.inicio, f.inicio + interval '60 minutes', '[)')
  )
  ORDER BY f.inicio;
END $$;

-- ----------------------------------------------------------------------------
-- Permisos. pg_default_acl de este proyecto concede EXECUTE explicito a anon,
-- authenticated y service_role sobre toda funcion nueva de public: revocar de
-- PUBLIC no se lo quita. Se nombra a cada rol, con la firma exacta.
--
-- Las internas no las ejecuta nadie mas que su dueno: franjas_libres y las
-- funciones de escritura son SECURITY DEFINER del mismo dueno, y dentro de
-- ellas el chequeo de EXECUTE se hace contra ese dueno.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.franjas_candidatas(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.franja_valida(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.franjas_libres(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.franjas_libres(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;
