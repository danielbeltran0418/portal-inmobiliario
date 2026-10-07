-- ============================================================================
-- CN-013: los limites del chat con IA eran comprobar-y-luego-insertar (TOCTOU).
--
-- src/lib/ia/limites.ts contaba turnos, tokens y mensajes del ultimo minuto en
-- varias consultas, y el server action insertaba el mensaje DESPUES. N envios
-- simultaneos leian todos el mismo estado ("4 mensajes este minuto") y pasaban
-- todos: el tope de 5/minuto y el de 10 turnos se saltaban en rafaga, y cada
-- envio de mas era una inferencia pagada.
--
-- Ahora la comprobacion y la insercion son una sola transaccion que bloquea la
-- fila de la conversacion (FOR UPDATE): los envios a la misma conversacion se
-- serializan y cada uno ve los mensajes que insertaron los anteriores.
--
-- Mismas reglas y mismo orden que verificarLimitesConversacion:
--   cerrada -> tope de turnos (10, cierra y despide) -> tope de tokens (15000,
--   cierra) -> 5 mensajes del comprador por minuto -> 3 conversaciones activas
--   del comprador en 24 h.
-- Devuelve un codigo; el mensaje solo se inserta con 'ok'.
-- ============================================================================

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
  v_activas  integer;
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

  SELECT count(*) INTO v_activas
  FROM public.conversaciones_ia
  WHERE comprador_id = p_comprador_id
    AND estado_conversacion IN ('activa', 'calificada', 'cita_propuesta')
    AND creado_en > now() - interval '24 hours';

  IF v_activas >= 3 THEN
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
