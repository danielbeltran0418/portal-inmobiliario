-- ============================================================================
-- Faltas por cancelar o mover una visita con menos de 8 horas de antelacion.
--
-- Regla (acordada con producto):
--   - Comprador y vendedor pueden cancelar o mover una visita confirmada hasta
--     que empieza, como hasta ahora. Pero si lo hacen con MENOS de 8 horas de
--     antelacion, se les anota una falta.
--   - Con 3 faltas dentro de una ventana de 30 dias, quedan bloqueados 7 dias
--     contados desde la tercera falta:
--       * un comprador bloqueado no puede reservar visitas nuevas (VS009);
--       * un vendedor bloqueado no recibe visitas nuevas (VS010) y sus franjas
--         no se ofrecen a nadie mas que a el mismo.
--   - El bloqueo no toca las visitas ya confirmadas: se pueden seguir moviendo
--     o cancelando (cada una tardia sumaria otra falta).
--
-- Las faltas las anota la base, dentro de cancelar_cita_como y
-- mover_cita_como, y no la aplicacion: PostgREST esta expuesto y cualquier
-- regla que viviera solo en el server action se saltaria llamando al RPC.
-- ============================================================================

CREATE TABLE public.faltas_cita (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id  uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  cita_id    uuid REFERENCES public.citas(id) ON DELETE SET NULL,
  motivo     text NOT NULL CHECK (motivo IN ('cancelacion_tardia', 'cambio_tardio')),
  creado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX faltas_cita_perfil_idx ON public.faltas_cita (perfil_id, creado_en DESC);

-- pg_default_acl concede CRUD a authenticated en toda tabla nueva (ver
-- 20260914000100): se revoca todo y se vuelve a dar solo lectura. Nadie
-- escribe aqui salvo las funciones SECURITY DEFINER de abajo.
REVOKE ALL ON public.faltas_cita FROM anon, authenticated, public;
GRANT SELECT ON public.faltas_cita TO authenticated;

ALTER TABLE public.faltas_cita ENABLE ROW LEVEL SECURITY;

CREATE POLICY faltas_cita_lectura_propia ON public.faltas_cita
  FOR SELECT TO authenticated
  USING (perfil_id = (SELECT auth.uid()));

CREATE POLICY faltas_cita_lectura_super_admin ON public.faltas_cita
  FOR SELECT TO authenticated
  USING (public.es_super_admin());

-- ----------------------------------------------------------------------------
-- Hasta cuando esta bloqueado un perfil, o NULL si no lo esta.
--
-- Un perfil queda bloqueado por una falta F si, contando F, acumula 3 faltas
-- en los 30 dias que terminan en F; el bloqueo dura 7 dias desde F. Si varias
-- faltas cumplen, manda la mas reciente.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bloqueo_citas_hasta(p_perfil uuid)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT max(f.creado_en) + interval '7 days'
  FROM public.faltas_cita f
  WHERE f.perfil_id = p_perfil
    AND f.creado_en > now() - interval '7 days'
    AND (
      SELECT count(*) FROM public.faltas_cita g
      WHERE g.perfil_id = p_perfil
        AND g.creado_en >  f.creado_en - interval '30 days'
        AND g.creado_en <= f.creado_en
    ) >= 3
$$;

-- Interna: la usan las funciones SECURITY DEFINER de este archivo. Desde la
-- aplicacion se consulta el propio bloqueo con mi_bloqueo_citas().
REVOKE EXECUTE ON FUNCTION public.bloqueo_citas_hasta(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bloqueo_citas_hasta(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mi_bloqueo_citas()
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.bloqueo_citas_hasta(auth.uid())
$$;

REVOKE EXECUTE ON FUNCTION public.mi_bloqueo_citas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mi_bloqueo_citas() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Anota una falta si faltan menos de 8 horas para p_inicio. Devuelve si la
-- anoto. Interna.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anotar_falta_si_tardia(
  p_perfil uuid, p_cita uuid, p_inicio timestamptz, p_motivo text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF now() <= p_inicio - interval '8 hours' THEN
    RETURN false;
  END IF;

  INSERT INTO public.faltas_cita (perfil_id, cita_id, motivo)
  VALUES (p_perfil, p_cita, p_motivo);

  PERFORM public.registrar_evento_auditoria(
    'falta_cita',
    'cita',
    p_cita,
    p_perfil,
    jsonb_build_object('motivo', p_motivo, 'inicio', p_inicio)
  );
  RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION public.anotar_falta_si_tardia(uuid, uuid, timestamptz, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- cancelar_cita_como: igual que en 20260915000400, mas la falta.
-- ----------------------------------------------------------------------------
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

  PERFORM public.anotar_falta_si_tardia(
    p_actor, p_cita_id, lower(v_cita.rango), 'cancelacion_tardia'
  );

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

-- ----------------------------------------------------------------------------
-- mover_cita_como: igual que en 20260915000500, mas la falta. Mover a ultima
-- hora le cuesta lo mismo a la otra parte que cancelar.
-- ----------------------------------------------------------------------------
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

  PERFORM public.anotar_falta_si_tardia(
    p_actor, p_cita_id, lower(v_cita.rango), 'cambio_tardio'
  );

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

-- ----------------------------------------------------------------------------
-- reservar_cita_como: igual que en 20260915000300, mas los dos bloqueos.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- franjas_libres: igual que en 20260915000200, pero un vendedor bloqueado no
-- ofrece franjas a nadie salvo a si mismo (para poder mover sus visitas). Sin
-- esto el chatbot seguiria proponiendo horas que reservar_cita_como rechaza.
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

  IF (v_actor IS NULL OR v_actor <> p_vendedor_id)
     AND public.bloqueo_citas_hasta(p_vendedor_id) IS NOT NULL THEN
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
