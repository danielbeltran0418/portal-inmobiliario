-- ============================================================================
-- Correccion de concurrencia en reserva de citas (deadlock 40P01 vs VS004).
--
-- En reservas simultaneas de la misma franja o del mismo vendedor, la insercion
-- concurrente en la tabla `citas` (con restriccion de exclusion GiST
-- `citas_sin_solape_por_vendedor`) podia derivar en 40P01 (deadlock_detected)
-- en lugar del codigo de negocio VS004 (exclusion_violation).
--
-- Solucion:
-- 1. Bloqueo FOR NO KEY UPDATE sobre el perfil del vendedor antes de validar
--    e insertar, serializando reservas sobre su agenda.
-- 2. Captura explicita de `deadlock_detected` ademas de `exclusion_violation`
--    en el bloque de insercion, traduciendo ambos a VS004.
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

  IF public.bloqueo_citas_hasta(v_lead.comprador_id) IS NOT NULL THEN
    RAISE EXCEPTION 'El comprador tiene las reservas bloqueadas por faltas' USING ERRCODE = 'VS009';
  END IF;

  IF public.bloqueo_citas_hasta(v_lead.vendedor_id) IS NOT NULL THEN
    RAISE EXCEPTION 'El vendedor no recibe visitas por faltas' USING ERRCODE = 'VS010';
  END IF;

  -- Serializar reservas sobre el calendario del vendedor para evitar interbloqueos
  -- en el indice GiST de exclusion al evaluar solapes simultaneos.
  PERFORM 1 FROM public.perfiles WHERE id = v_lead.vendedor_id FOR NO KEY UPDATE;

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
    WHEN exclusion_violation OR deadlock_detected THEN
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

REVOKE EXECUTE ON FUNCTION public.reservar_cita_como(uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_cita_como(uuid, timestamptz, uuid)
  TO service_role;
