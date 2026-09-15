-- ============================================================================
-- SP5: reservar una visita. Mismo patron de escritura que crear_lead()
-- (20260911000400): nadie tiene INSERT sobre citas, y la fila la escribe una
-- funcion SECURITY DEFINER que deriva del lead todo lo que no debe venir del
-- cliente -- propiedad_id, comprador_id y vendedor_id NUNCA son parametros.
--
-- DOS NIVELES, y esa separacion es la costura con SP6:
--   reservar_cita_como(lead, inicio, actor)  solo service_role. Logica completa.
--   reservar_cita(lead, inicio)              authenticated. actor = auth.uid().
-- Un agente de SP6 reservara en nombre de un comprador con la _como, sin tocar
-- SP5. Y es el mayor riesgo de SP5: si authenticated pudiera ejecutar la _como,
-- cualquiera reservaria en nombre de cualquiera pasando otro p_actor. Su
-- privilegio tiene prueba y falsificacion propias (Tarea 7).
--
-- Codigos, clase VS (rango de la implementacion: clases que empiezan por I-Z;
-- Postgres no usa ninguna que empiece por V):
--   42501 sin actor
--   VS001 el lead no existe
--   VS002 el actor no es el comprador del lead
--   VS003 el lead no esta aceptado
--   VS004 franja no valida, o ganada por otra reserva simultanea (23P01)
--   VS005 ya hay una visita confirmada para ese lead (23505)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reservar_cita_como(
  p_lead_id uuid, p_inicio timestamptz, p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_cita uuid;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesion para reservar una visita' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La solicitud no existe' USING ERRCODE = 'VS001';
  END IF;

  IF v_lead.comprador_id <> p_actor THEN
    RAISE EXCEPTION 'No participas en esta solicitud' USING ERRCODE = 'VS002';
  END IF;

  IF v_lead.estado <> 'aceptado' THEN
    RAISE EXCEPTION 'La solicitud no esta aceptada' USING ERRCODE = 'VS003';
  END IF;

  -- Disponibilidad, bloqueo, horizonte y "en punto", en un solo sitio
  -- (20260915000300). La ocupacion NO se mira aqui: la hace cumplir la
  -- exclusion al insertar, que es lo unico que aguanta dos reservas a la vez.
  IF NOT public.franja_valida(v_lead.vendedor_id, p_inicio) THEN
    RAISE EXCEPTION 'La franja no es valida' USING ERRCODE = 'VS004';
  END IF;

  BEGIN
    INSERT INTO public.citas (lead_id, propiedad_id, comprador_id, vendedor_id, rango)
    VALUES (
      v_lead.id, v_lead.propiedad_id, v_lead.comprador_id, v_lead.vendedor_id,
      tstzrange(p_inicio, p_inicio + interval '60 minutes', '[)')
    )
    RETURNING id INTO v_cita;
  EXCEPTION
    WHEN exclusion_violation THEN
      -- Otra reserva simultanea gano la franja. Para quien reserva es lo mismo
      -- que una lista vieja: VS004.
      RAISE EXCEPTION 'La franja ya esta ocupada' USING ERRCODE = 'VS004';
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Ya hay una visita confirmada para esta solicitud' USING ERRCODE = 'VS005';
  END;

  PERFORM public.registrar_evento_auditoria(
    'cita_reservada',
    'cita',
    v_cita,
    p_actor,
    jsonb_build_object(
      'lead_id', v_lead.id,
      'propiedad_id', v_lead.propiedad_id,
      'vendedor_id', v_lead.vendedor_id,
      'inicio', p_inicio
    )
  );

  RETURN v_cita;
END $$;

-- SECURITY DEFINER tambien: asi puede ejecutar la _como, que authenticated no
-- puede. auth.uid() sigue leyendo el JWT de la peticion dentro de una funcion
-- SECURITY DEFINER (crear_lead lo usa igual).
CREATE OR REPLACE FUNCTION public.reservar_cita(p_lead_id uuid, p_inicio timestamptz)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN public.reservar_cita_como(p_lead_id, p_inicio, auth.uid());
END $$;

-- pg_default_acl concede EXECUTE explicito a anon, authenticated y
-- service_role en toda funcion nueva de public: se nombra a cada uno.
REVOKE EXECUTE ON FUNCTION public.reservar_cita_como(uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_cita_como(uuid, timestamptz, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.reservar_cita(uuid, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_cita(uuid, timestamptz)
  TO authenticated, service_role;
