-- ============================================================================
-- SP5: cancelar una visita. Comprador y vendedor, simetrico.
--
--   42501 sin actor
--   VS006 la visita no existe
--   VS002 el actor no es ni el comprador ni el vendedor de la visita
--   VS007 ya estaba cancelada
--   VS008 ya empezo
--
-- FOR UPDATE: bloquea la fila frente a un mover o un cancelar simultaneos.
-- Sin el, dos cancelaciones podrian leer 'confirmada' a la vez y auditar dos
-- veces.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancelar_cita_como(p_cita_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cita public.citas%ROWTYPE;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesion para cancelar una visita' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cita FROM public.citas WHERE id = p_cita_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La visita no existe' USING ERRCODE = 'VS006';
  END IF;

  IF p_actor <> v_cita.comprador_id AND p_actor <> v_cita.vendedor_id THEN
    RAISE EXCEPTION 'No participas en esta visita' USING ERRCODE = 'VS002';
  END IF;

  IF v_cita.estado = 'cancelada' THEN
    RAISE EXCEPTION 'La visita ya estaba cancelada' USING ERRCODE = 'VS007';
  END IF;

  IF now() >= lower(v_cita.rango) THEN
    RAISE EXCEPTION 'La visita ya empezo' USING ERRCODE = 'VS008';
  END IF;

  UPDATE public.citas
     SET estado = 'cancelada', cancelada_por = p_actor, actualizado_en = now()
   WHERE id = p_cita_id;

  PERFORM public.registrar_evento_auditoria(
    'cita_cancelada',
    'cita',
    p_cita_id,
    p_actor,
    jsonb_build_object(
      'lead_id', v_cita.lead_id,
      'inicio', lower(v_cita.rango),
      'fin', upper(v_cita.rango)
    )
  );
END $$;

CREATE OR REPLACE FUNCTION public.cancelar_cita(p_cita_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.cancelar_cita_como(p_cita_id, auth.uid());
END $$;

REVOKE EXECUTE ON FUNCTION public.cancelar_cita_como(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_cita_como(uuid, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.cancelar_cita(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_cita(uuid)
  TO authenticated, service_role;
