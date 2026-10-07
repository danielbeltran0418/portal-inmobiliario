-- ============================================================================
-- Limite de 3 conversaciones activas en 24 h: frena la CUARTA, no las tres.
--
-- En 20261009000100 (y antes en src/lib/ia/limites.ts) se contaban TODAS las
-- conversaciones activas del comprador, incluida aquella en la que escribia:
-- con 3 abiertas, no podia seguir hablando en ninguna. Lo que se queria era
-- impedir abrir una cuarta.
--
-- conversacion_excede_concurrencia(c) mira solo las conversaciones activas
-- del mismo comprador creadas en las ultimas 24 h y ANTES que c (empate por
-- id): las tres primeras nunca exceden; la cuarta si, hasta que alguna de las otras se
-- cierre o salga de la ventana. La usan registrar_mensaje_comprador_ia() y el
-- despachador (src/lib/ia/despachador.ts), que con ella evita pagar la
-- inferencia inicial de una conversacion que no podria continuar.
--
-- El resto de registrar_mensaje_comprador_ia es IDENTICO al de 20261009000100.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.conversacion_excede_concurrencia(p_conversacion_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*) >= 3
  FROM public.conversaciones_ia c
  JOIN public.conversaciones_ia otra
    ON otra.comprador_id = c.comprador_id
   AND otra.id <> c.id
  WHERE c.id = p_conversacion_id
    AND otra.estado_conversacion IN ('activa', 'calificada', 'cita_propuesta')
    AND otra.creado_en > now() - interval '24 hours'
    AND (otra.creado_en < c.creado_en OR (otra.creado_en = c.creado_en AND otra.id < c.id));
$$;

REVOKE EXECUTE ON FUNCTION public.conversacion_excede_concurrencia(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conversacion_excede_concurrencia(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_mensaje_comprador_ia(
  p_conversacion_id uuid,
  p_comprador_id    uuid,
  p_contenido       text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_conv     public.conversaciones_ia%ROWTYPE;
  v_turnos   integer;
  v_tokens   bigint;
  v_minuto   integer;
BEGIN
  SELECT * INTO v_conv
  FROM public.conversaciones_ia
  WHERE id = p_conversacion_id AND comprador_id = p_comprador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'no_encontrada';
  END IF;

  IF v_conv.estado_conversacion = 'cerrada' THEN
    RETURN 'cerrada';
  END IF;

  SELECT count(*) FILTER (WHERE emisor = 'comprador'),
         coalesce(sum(coalesce(tokens_entrada, 0) + coalesce(tokens_salida, 0)), 0),
         count(*) FILTER (WHERE emisor = 'comprador' AND creado_en > now() - interval '1 minute')
    INTO v_turnos, v_tokens, v_minuto
  FROM public.mensajes_ia
  WHERE conversacion_id = p_conversacion_id;

  IF v_turnos >= 10 THEN
    UPDATE public.conversaciones_ia
       SET estado_conversacion = 'cerrada', actualizado_en = now()
     WHERE id = p_conversacion_id;
    INSERT INTO public.mensajes_ia
      (conversacion_id, comprador_id, vendedor_id, emisor, contenido, tokens_entrada, tokens_salida, modelo)
    VALUES
      (p_conversacion_id, v_conv.comprador_id, v_conv.vendedor_id, 'agente_ia',
       'He transferido tu historial y tus datos directamente al vendedor para que te brinde atención personalizada. ¡Muchas gracias por tu interés!',
       0, 0, 'sistema');
    RETURN 'tope_turnos';
  END IF;

  IF v_tokens >= 15000 THEN
    UPDATE public.conversaciones_ia
       SET estado_conversacion = 'cerrada', actualizado_en = now()
     WHERE id = p_conversacion_id;
    RETURN 'tope_tokens';
  END IF;

  IF v_minuto >= 5 THEN
    RETURN 'rate_limit';
  END IF;

  IF public.conversacion_excede_concurrencia(p_conversacion_id) THEN
    RETURN 'concurrencia';
  END IF;

  INSERT INTO public.mensajes_ia
    (conversacion_id, comprador_id, vendedor_id, emisor, contenido, tokens_entrada, tokens_salida, modelo)
  VALUES
    (p_conversacion_id, v_conv.comprador_id, v_conv.vendedor_id, 'comprador', p_contenido, 0, 0, 'usuario');

  RETURN 'ok';
END;
$$;

-- Solo el servidor (service_role) la llama: el comprador_id lo pone el server
-- action desde getUser(), nunca el navegador.
REVOKE EXECUTE ON FUNCTION public.registrar_mensaje_comprador_ia(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_mensaje_comprador_ia(uuid, uuid, text)
  TO service_role;
