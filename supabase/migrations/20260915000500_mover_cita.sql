-- ============================================================================
-- SP5: mover una visita. Comprador y vendedor, simetrico.
--
--   42501 sin actor
--   VS006 la visita no existe
--   VS002 el actor no es ni el comprador ni el vendedor de la visita
--   VS007 la visita no esta confirmada
--   VS008 ya empezo
--   VS004 la nueva franja no es valida, o esta ocupada (23P01)
--
-- UN SOLO UPDATE del rango. Nunca hay un instante con las dos franjas ocupadas
-- ni con ninguna: si la nueva choca, el UPDATE entero falla y la fila conserva
-- su rango original. Una fila no entra en conflicto consigo misma en la
-- restriccion de exclusion, asi que mover a una franja contigua no se bloquea.
--
-- La franja nueva se valida contra el vendedor DE LA VISITA, no contra el
-- dueno actual de la propiedad (ver la seccion 13 del spec: reasignar una
-- propiedad con visitas futuras queda para SP7).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mover_cita_como(
  p_cita_id uuid, p_nuevo_inicio timestamptz, p_actor uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cita        public.citas%ROWTYPE;
  v_rango_nuevo tstzrange;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesion para mover una visita' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cita FROM public.citas WHERE id = p_cita_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La visita no existe' USING ERRCODE = 'VS006';
  END IF;

  IF p_actor <> v_cita.comprador_id AND p_actor <> v_cita.vendedor_id THEN
    RAISE EXCEPTION 'No participas en esta visita' USING ERRCODE = 'VS002';
  END IF;

  IF v_cita.estado <> 'confirmada' THEN
    RAISE EXCEPTION 'La visita no esta confirmada' USING ERRCODE = 'VS007';
  END IF;

  IF now() >= lower(v_cita.rango) THEN
    RAISE EXCEPTION 'La visita ya empezo' USING ERRCODE = 'VS008';
  END IF;

  IF NOT public.franja_valida(v_cita.vendedor_id, p_nuevo_inicio) THEN
    RAISE EXCEPTION 'La franja no es valida' USING ERRCODE = 'VS004';
  END IF;

  v_rango_nuevo := tstzrange(p_nuevo_inicio, p_nuevo_inicio + interval '60 minutes', '[)');

  BEGIN
    UPDATE public.citas
       SET rango = v_rango_nuevo, actualizado_en = now()
     WHERE id = p_cita_id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'La franja ya esta ocupada' USING ERRCODE = 'VS004';
  END;

  PERFORM public.registrar_evento_auditoria(
    'cita_movida',
    'cita',
    p_cita_id,
    p_actor,
    jsonb_build_object(
      'lead_id', v_cita.lead_id,
      'rango_anterior', jsonb_build_object('inicio', lower(v_cita.rango), 'fin', upper(v_cita.rango)),
      'rango_nuevo',    jsonb_build_object('inicio', lower(v_rango_nuevo), 'fin', upper(v_rango_nuevo))
    )
  );
END $$;

CREATE OR REPLACE FUNCTION public.mover_cita(p_cita_id uuid, p_nuevo_inicio timestamptz)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.mover_cita_como(p_cita_id, p_nuevo_inicio, auth.uid());
END $$;

REVOKE EXECUTE ON FUNCTION public.mover_cita_como(uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mover_cita_como(uuid, timestamptz, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.mover_cita(uuid, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mover_cita(uuid, timestamptz)
  TO authenticated, service_role;
