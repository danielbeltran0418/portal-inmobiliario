-- ============================================================================
-- Reduccion de la ventana de bloqueo de login de 15 a 5 minutos.
--
-- Redefine:
--   1. public.accion_bloqueada: la rama 'login' pasa de '15 minutes' a
--      '5 minutes' manteniendo intactas las ramas 'registro' y 'recuperar'.
--   2. public.registrar_intento_accion: el evento de auditoria
--      'bloqueo_por_intentos' registra minutos_bloqueo = 5 en sus metadatos.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accion_bloqueada(p_accion text, p_clave text, p_ip inet)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE p_accion
    WHEN 'login' THEN (
      SELECT count(*) >= 5
      FROM public.intentos_accion
      WHERE accion = 'login'
        AND clave = lower(p_clave)
        AND (p_ip IS NULL OR ip = p_ip)
        AND exitoso = false
        AND creado_en > now() - interval '5 minutes'
    )
    WHEN 'registro' THEN (
      CASE WHEN p_ip IS NULL THEN true
      ELSE (
        SELECT count(*) >= 3
        FROM public.intentos_accion
        WHERE accion = 'registro'
          AND ip = p_ip
          AND exitoso = true
          AND creado_en > now() - interval '60 minutes'
      )
      END
    )
    WHEN 'recuperar' THEN (
      (
        SELECT count(*) >= 3
        FROM public.intentos_accion
        WHERE accion = 'recuperar'
          AND clave = lower(p_clave)
          AND creado_en > now() - interval '60 minutes'
      )
      OR (
        p_ip IS NOT NULL AND (
          SELECT count(*) >= 10
          FROM public.intentos_accion
          WHERE accion = 'recuperar'
            AND ip = p_ip
            AND creado_en > now() - interval '60 minutes'
        )
      )
    )
    ELSE true
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.accion_bloqueada(text, text, inet)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accion_bloqueada(text, text, inet)
  TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_intento_accion(
  p_accion text, p_clave text, p_ip inet, p_exitoso boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor           uuid;
  v_bloqueado_antes boolean;
  v_metadatos       jsonb;
BEGIN
  SELECT p.id INTO v_actor
  FROM public.perfiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(u.email) = lower(p_clave);

  v_metadatos := jsonb_build_object(
    'correo',       lower(p_clave),
    'ip_confiable', p_ip IS NOT NULL
  );

  v_bloqueado_antes := public.accion_bloqueada(p_accion, p_clave, p_ip);

  INSERT INTO public.intentos_accion (accion, clave, ip, exitoso)
  VALUES (p_accion, lower(p_clave), p_ip, p_exitoso);

  IF p_exitoso AND p_accion = 'login' THEN
    DELETE FROM public.intentos_accion
    WHERE accion = 'login'
      AND clave = lower(p_clave)
      AND (p_ip IS NULL OR ip = p_ip)
      AND exitoso = false;
  END IF;

  IF p_accion = 'login' THEN
    PERFORM public.registrar_evento_auditoria(
      CASE WHEN p_exitoso THEN 'login_exitoso' ELSE 'login_fallido' END,
      'sesion', v_actor, v_actor, v_metadatos, p_ip
    );

    IF NOT p_exitoso
       AND NOT v_bloqueado_antes
       AND public.accion_bloqueada('login', p_clave, p_ip) THEN
      PERFORM public.registrar_evento_auditoria(
        'bloqueo_por_intentos', 'sesion', v_actor, v_actor,
        v_metadatos || jsonb_build_object('minutos_bloqueo', 5),
        p_ip
      );
    END IF;
  END IF;

  DELETE FROM public.intentos_accion WHERE creado_en < now() - interval '24 hours';
END $$;

REVOKE EXECUTE ON FUNCTION public.registrar_intento_accion(text, text, inet, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_intento_accion(text, text, inet, boolean)
  TO service_role;
